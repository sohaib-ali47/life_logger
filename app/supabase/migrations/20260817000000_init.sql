-- ═══════════════════════════════════════════════════════════════════════
-- Life OS — schema
--
-- Design notes that matter:
--
--   · The client generates every primary key (uuid for entries, a slug for
--     sections). Sync is then a plain upsert with no round trip to discover
--     an id, and a record created offline keeps its identity forever.
--
--   · `updated_at` is supplied BY THE CLIENT and is the merge key for
--     last-write-wins. A trigger overwriting it server-side would make
--     every pushed row look newer than the copy on your other device, and
--     sync would ping-pong. It is deliberately not touched on update.
--
--   · Deletes are soft (`deleted_at`). A hard delete cannot replicate — the
--     other device would simply re-push the row it still holds.
--
--   · `entries.at` is TEXT, not timestamptz, on purpose. It holds a naive
--     local wall-clock stamp ("2026-08-17T18:42:03"). Handing that to
--     Postgres as a timestamp would attach a zone and shift the number you
--     actually saw on the clock. The logical day lives in `date`, which is
--     what every query groups by.
--
--   · Row level security is on for every table, keyed to auth.uid(). There
--     is no path that returns another user's rows.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── profiles ───────────────────────────────────────────────────────────
-- A row per account, created automatically on sign-up. Holds the display
-- name so the app never has to read auth.users directly.

create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── sections ───────────────────────────────────────────────────────────
-- The trackers themselves. Queryable columns for the fields worth
-- filtering on; `data` carries the rest of the shape (variants, targets,
-- quick presets, follow-ups, exercises) so the schema needs no migration
-- every time a primitive gains a feature.

create table if not exists public.sections (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  id          text        not null,
  name        text        not null,
  primitive   text        not null,
  pillar      text,
  slot        smallint,
  sort_order  integer     not null default 0,
  archived    boolean     not null default false,
  data        jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, id)
);

create index if not exists sections_user_updated_idx
  on public.sections (user_id, updated_at desc);

-- ── entries ────────────────────────────────────────────────────────────
-- Every logged fact. One row per tap.

create table if not exists public.entries (
  user_id     uuid        not null references auth.users (id) on delete cascade,
  id          uuid        not null,
  section_id  text        not null,
  date        date        not null,
  value       double precision not null default 0,
  at          text,                       -- naive local wall clock, see note above
  note        text        not null default '',
  meta        jsonb       not null default '{}'::jsonb,
  source      text        not null default 'manual',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, id)
);

create index if not exists entries_user_date_idx
  on public.entries (user_id, date desc);

create index if not exists entries_user_section_idx
  on public.entries (user_id, section_id, date desc);

-- the index the incremental pull actually uses
create index if not exists entries_user_updated_idx
  on public.entries (user_id, updated_at desc);

-- ── settings ───────────────────────────────────────────────────────────
-- One row per user. Small enough that whole-document last-write-wins beats
-- the complexity of per-field merging.

create table if not exists public.settings (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Row level security
-- ═══════════════════════════════════════════════════════════════════════

alter table public.profiles enable row level security;
alter table public.sections enable row level security;
alter table public.entries  enable row level security;
alter table public.settings enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own sections" on public.sections;
create policy "own sections" on public.sections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- Housekeeping
-- ═══════════════════════════════════════════════════════════════════════

-- Purge tombstones every device has certainly seen. Ninety days is long
-- enough for a phone that sat in a drawer over a holiday.
create or replace function public.purge_tombstones()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.entries  where deleted_at is not null and deleted_at < now() - interval '90 days';
  delete from public.sections where deleted_at is not null and deleted_at < now() - interval '90 days';
$$;

comment on function public.purge_tombstones is
  'Schedule daily with pg_cron once more than one device is syncing.';
