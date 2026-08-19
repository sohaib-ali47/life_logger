-- ═══════════════════════════════════════════════════════════════════════
-- Plans — what you said you would do, and when.
--
-- Kept separate from `entries` on purpose: a plan that never happened is
-- still a fact worth keeping, and the gap between the two tables is the
-- whole point of the plan-against-actual view. Same conventions as the
-- rest of the schema — client-generated ids, client-supplied updated_at
-- as the merge key, soft deletes, RLS keyed to auth.uid().
--
-- `start_min` is minutes from the user's configured day boundary, not a
-- timestamp, so a block keeps its position when the boundary moves.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.plans (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  id            uuid        not null,
  section_id    text        not null,
  variant_id    text,
  date          date        not null,
  start_min     integer     not null default 0,
  minutes       integer     not null default 30,
  title         text        not null default '',
  remind_before integer     not null default 5,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  primary key (user_id, id)
);

create index if not exists plans_user_date_idx    on public.plans (user_id, date desc);
create index if not exists plans_user_updated_idx on public.plans (user_id, updated_at desc);

alter table public.plans enable row level security;

drop policy if exists "own plans" on public.plans;
create policy "own plans" on public.plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
