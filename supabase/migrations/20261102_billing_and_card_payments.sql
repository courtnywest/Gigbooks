-- GigBooks: Free / Pro plans and card payments on invoices.
-- Run once in the Supabase SQL editor. Safe to run more than once.

-- 1. Billing state, one row per account -----------------------------------
-- Only the server (Stripe functions, using the service role) writes this table.
-- Users can read their own row; they can't change their plan from the browser.
create table if not exists public.billing (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  plan                   text not null default 'free' check (plan in ('free','pro')),
  pro_until              timestamptz,            -- free Pro until this date (founding members, comps)
  subscription_status    text,
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  stripe_account_id      text unique,            -- Stripe Connect account for card payments
  charges_enabled        boolean not null default false,
  updated_at             timestamptz not null default now()
);

alter table public.billing enable row level security;

drop policy if exists "read own billing" on public.billing;
create policy "read own billing" on public.billing
  for select to authenticated
  using (user_id = auth.uid());
-- No insert/update/delete policies for users.

-- Pro = paying subscriber, or within pro_until, or within 14 days of signing up (the trial).
-- Server functions (Giggy, Contract Reader, bank sync, invoice email) can call this to enforce Pro.
create or replace function public.is_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (select 1 from billing b where b.user_id = uid
                 and (b.plan = 'pro' or (b.pro_until is not null and b.pro_until > now())))
      or exists (select 1 from auth.users u where u.id = uid and u.created_at > now() - interval '14 days');
$$;

revoke all on function public.is_pro(uuid) from public;
grant execute on function public.is_pro(uuid) to authenticated, service_role;

-- 2. Founding members ------------------------------------------------------
-- Everyone who signed up before plans existed keeps Pro free through 2027.
-- Change the date (or delete this statement) if you'd rather do something else.
insert into public.billing (user_id, pro_until)
select id, '2028-01-01'::timestamptz from auth.users
on conflict (user_id) do nothing;

-- 3. Card payments on invoices --------------------------------------------
-- Each invoice gets an unguessable token for its public "pay by card" link.
alter table public.invoices add column if not exists pay_token uuid not null default gen_random_uuid();
create unique index if not exists invoices_pay_token_key on public.invoices (pay_token);
