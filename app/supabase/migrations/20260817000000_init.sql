-- ═══════════════════════════════════════════════════════════════════════
-- Life OS — initial schema
--
-- Design notes that matter:
--
--   · The client generates every primary key (uuid for entries, a slug
--     for sections). That makes sync a plain upsert with no server round
--     trip to discover an id, and it means a record created offline keeps
--     its identity forever.
--
--   · `updated_at` is supplied BY THE CLIENT and is the merge key for
--     last-write-wins. A trigger that overwrote it server-side would make
--     every pushed row look newer than the copy on your other device and
--     sync would ping-pong. It is deliberately not defaulted on update.
--
--   · Deletes are soft (`deleted_at`). A hard delete cannot replicate —
--     the other device would simply re-push the row it still has.
--
--   · `entries.at` is TEXT, not timestamptz, on purpose. It stores a
--     naive local wall-clock stamp ("2026-08-17T18:42:03"). Handing that
--     to Postgres as a timestamp would attach a zone and shift the number
--     you actually saw on the clock. The logical day already lives in
--     `date`, which is what every query groups by.
--
--   · Row level security is on for every table, with policies keyed to
--     auth.uid(). There is no service path that bypasses it.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── sections ───────────────────────────────────────────────────────────
-- The trackers themselves. Queryable columns for the fields worth
-- filtering on; `data` carries the rest of the shape (variants, targets,
-- quick presets, follow-ups, exercises) so the schema does not need a
-- migration every time a primitive gains a feature.

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
-- One row per user. Theme, day boundary, score goal, the running timer,
-- closed days. Small enough that a whole-document last-write-wins is the
-- right trade against the complexity of per-field merging.

create table if not exists public.settings (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Row level security
-- ═══════════════════════════════════════════════════════════════════════

alter table public.sections enable row level security;
alter table public.entries  enable row level security;
alter table public.settings enable row level security;

-- sections
drop policy if exists "sections are private" on public.sections;
create policy "sections are private"
  on public.sections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- entries
drop policy if exists "entries are private" on public.entries;
create policy "entries are private"
  on public.entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- settings
drop policy if exists "settings are private" on public.settings;
create policy "settings are private"
  on public.settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════
-- Housekeeping
-- ═══════════════════════════════════════════════════════════════════════

-- Purge tombstones that every device has certainly seen. Ninety days is
-- long enough for a phone that sat in a drawer over a holiday.
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
  'Schedule daily with pg_cron once you have more than one device syncing.';
