-- GigBooks: first-party product analytics.
-- Records *that* something happened (signed up, added a first transaction,
-- upgraded), never amounts, names, merchants or notes. Run once in the
-- Supabase SQL editor. Until this table exists the app sends nothing.

create table if not exists public.product_events (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references auth.users(id) on delete cascade,
  event      text not null check (event in (
               'signup_started','signup_completed','onboarding_completed','first_transaction_added',
               'first_transaction_reviewed','bank_connection_completed','first_money_summary_viewed',
               'weekly_checkin_completed','pro_upgrade_started','pro_upgrade_completed')),
  -- Small labels only, e.g. {"source":"manual"} or {"interval":"year"}. Capped so nothing large slips in.
  props      jsonb not null default '{}'::jsonb check (pg_column_size(props) < 200),
  created_at timestamptz not null default now()
);

create index if not exists product_events_event_time on public.product_events (event, created_at);

alter table public.product_events enable row level security;

-- Signed-in users can add events for themselves.
drop policy if exists "add own events" on public.product_events;
create policy "add own events" on public.product_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- Before signing in, only the two signup events can be added, with no user attached.
drop policy if exists "add signup events" on public.product_events;
create policy "add signup events" on public.product_events
  for insert to anon
  with check (user_id is null and event in ('signup_started','signup_completed'));

-- No select policies: events can't be read back through the app. Look at them in the
-- Supabase dashboard, e.g. this activation funnel for the last 30 days:
--
--   select event, count(distinct coalesce(user_id::text, id::text)) as people
--   from product_events
--   where created_at > now() - interval '30 days'
--   group by event
--   order by people desc;
