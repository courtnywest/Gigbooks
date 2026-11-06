-- GigBooks: error reports, so you hear about problems before users have to tell you.
-- Records what broke (a trimmed message, where in the code, which page, browser), never
-- amounts, names or other financial details: the app scrubs emails and long numbers out
-- of messages before sending. Run once in the Supabase SQL editor. Safe to run again.

create table if not exists public.app_errors (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references auth.users(id) on delete set null,
  kind       text not null check (kind in ('error','rejection','save_failed')),
  message    text not null check (char_length(message) <= 300),
  source     text not null default '' check (char_length(source) <= 160),
  view       text not null default '' check (char_length(view) <= 40),
  browser    text not null default '' check (char_length(browser) <= 160),
  created_at timestamptz not null default now()
);

create index if not exists app_errors_time on public.app_errors (created_at desc);

alter table public.app_errors enable row level security;

-- Anyone using the app can add a report: signed in (tied to their account) or not (no account).
drop policy if exists "report own errors" on public.app_errors;
create policy "report own errors" on public.app_errors
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "report errors signed out" on public.app_errors;
create policy "report errors signed out" on public.app_errors
  for insert to anon
  with check (user_id is null);

-- No select policies: reports can't be read back through the app.
-- Check them in the dashboard. Most common problems in the last 7 days:
--
--   select kind, message, source, view, count(*) as times, count(distinct user_id) as people,
--          max(created_at) as last_seen
--   from app_errors
--   where created_at > now() - interval '7 days'
--   group by kind, message, source, view
--   order by times desc
--   limit 50;
