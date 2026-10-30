-- GigBooks: anonymous rate benchmarks and referral counts.
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- The app works without this; benchmarks and invite counts stay hidden until it's applied.

-- 1. Rate benchmarks ------------------------------------------------------
-- Creators who opt in share three fields per signed deal: their creator type,
-- the kind of deliverable and the price. No names, brands or user-identifying data
-- are ever readable: rows can be inserted but not selected, and the summary function
-- only returns percentiles once there are at least 5 deals from 3 different creators.
create table if not exists public.rate_benchmarks (
  id           uuid primary key default gen_random_uuid(),
  creator_type text not null check (char_length(creator_type) <= 32),
  deliverable  text not null check (char_length(deliverable) <= 64),
  amount       numeric not null check (amount > 0 and amount < 1000000),
  contributor  uuid not null default auth.uid(),
  created_at   timestamptz not null default now()
);

alter table public.rate_benchmarks enable row level security;

drop policy if exists "contribute own rates" on public.rate_benchmarks;
create policy "contribute own rates" on public.rate_benchmarks
  for insert to authenticated
  with check (contributor = auth.uid());
-- No select/update/delete policies: individual rows are never readable through the API.

create or replace function public.rate_benchmark(p_creator_type text, p_deliverable text)
returns table (n integer, p25 numeric, median numeric, p75 numeric)
language sql
security definer
set search_path = public
as $$
  with pool as (
    select amount, contributor
    from rate_benchmarks
    where creator_type = p_creator_type
      and deliverable = p_deliverable
      and created_at > now() - interval '18 months'
  )
  select count(*)::int,
         round(percentile_cont(0.25) within group (order by amount)::numeric, 0),
         round(percentile_cont(0.50) within group (order by amount)::numeric, 0),
         round(percentile_cont(0.75) within group (order by amount)::numeric, 0)
  from pool
  having count(*) >= 5 and count(distinct contributor) >= 3;
$$;

revoke all on function public.rate_benchmark(text, text) from public;
grant execute on function public.rate_benchmark(text, text) to authenticated;

-- 2. Referral count -------------------------------------------------------
-- New sign-ups store `referred_by` (the first 10 hex characters of the inviter's
-- user id) in their auth metadata. This returns how many people the caller referred.
create or replace function public.my_referral_count()
returns integer
language sql
security definer
set search_path = public, auth
as $$
  select count(*)::int
  from auth.users u
  where u.raw_user_meta_data->>'referred_by' = left(replace(auth.uid()::text, '-', ''), 10);
$$;

revoke all on function public.my_referral_count() from public;
grant execute on function public.my_referral_count() to authenticated;
