-- ============================================================================
-- FINANCE APP — ONE-TIME SUPABASE BOOTSTRAP
-- ============================================================================
-- Paste this entire file into Supabase Dashboard -> SQL Editor -> New query
-- and click Run. It is safe to re-run: everything is create-if-missing or
-- create-or-replace, so nothing you already have is overwritten.
--
-- This enables:
--   1. Exact payment totals for the Payments dashboard.
--   2. The loan schedule + payment RPCs used by Daily/Weekly/Monthly and
--      Interest-only modules (payments cannot post without these).
--   3. Supabase Realtime publication for the Collections live updates.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1/3  finance_payment_totals  (20261117100000_add_finance_payment_totals.sql)
-- ----------------------------------------------------------------------------

-- Server-side aggregates for the admin Payments dashboard.
--
-- The page previously summed the newest 250 joined rows in the browser, which
-- understated every metric once the ledger grew past 250 payments. This
-- function is SECURITY INVOKER (the default), so PostgREST RLS and the
-- workspace isolation policies still decide which rows are visible.

create or replace function public.finance_payment_totals(
  p_today date default current_date,
  p_month_start date default date_trunc('month', current_date)::date
)
returns table (
  payment_count bigint,
  today_total numeric,
  month_total numeric,
  customers_paid bigint
)
language sql
stable
set search_path = public
as $$
  select
    count(p.id)::bigint,
    coalesce(
      sum(p.payment_amount) filter (where p.payment_date = p_today),
      0
    )::numeric,
    coalesce(
      sum(p.payment_amount) filter (where p.payment_date >= p_month_start),
      0
    )::numeric,
    count(distinct fr.customer_id)::bigint
  from public.finance_payments as p
  left join public.finance_records as fr on fr.id = p.finance_record_id
$$;

comment on function public.finance_payment_totals(date, date) is
  'Exact payment counts and totals for the caller-visible workspace.';

grant execute on function public.finance_payment_totals(date, date) to authenticated;


-- ----------------------------------------------------------------------------
-- 2/3  Missing loan RPCs  (20261117110000_add_missing_loan_rpcs.sql)
-- ----------------------------------------------------------------------------

-- Baseline for the six finance RPCs that the frontend calls but that are not
-- defined anywhere else in this repository (they are only ALTERed by later
-- migrations). Each function is created ONLY when it does not already exist,
-- so an existing production definition is never overwritten.
--
-- These are also the transactional primitives required before the Collections
-- real-time event layer can be trusted: schedule generation and payment
-- posting each happen in one database call.

-- ---------------------------------------------------------------------------
-- Schedule generators (one row per installment)
-- ---------------------------------------------------------------------------

do $do$
begin
  if to_regprocedure('public.generate_daily_schedule(bigint)') is null then
    execute $fn$
      create function public.generate_daily_schedule(p_finance_record_id bigint)
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        finance_row public.finance_records%rowtype;
        installment_count integer;
        installment_amount numeric;
        i integer;
      begin
        select * into finance_row from public.finance_records
        where id = p_finance_record_id for update;
        if not found then
          raise exception 'Finance record not found';
        end if;

        if exists (select 1 from public.repayment_schedule where finance_record_id = p_finance_record_id) then
          return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', 0, 'already_generated', true);
        end if;

        installment_count := coalesce(nullif(split_part(coalesce(finance_row.period, ''), ' ', 1), '')::integer, 0);
        if installment_count <= 0 and finance_row.entry_date is not null and finance_row.ending_date is not null then
          installment_count := greatest((finance_row.ending_date - finance_row.entry_date)::integer, 1);
        end if;
        if installment_count <= 0 then
          raise exception 'Cannot determine the number of daily installments';
        end if;

        installment_amount := round(coalesce(finance_row.amount, 0) / installment_count, 2);

        for i in 1..installment_count loop
          insert into public.repayment_schedule (
            finance_record_id, installment_number, due_date, due_amount, paid_amount
          ) values (
            p_finance_record_id,
            i,
            finance_row.entry_date + (i - 1),
            case when i = installment_count
              then greatest(coalesce(finance_row.amount, 0) - installment_amount * (installment_count - 1), 0)
              else installment_amount
            end,
            0
          );
        end loop;

        return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', installment_count, 'already_generated', false);
      end;
      $body$;
    execute 'grant execute on function public.generate_daily_schedule(bigint) to authenticated';
  end if;

  if to_regprocedure('public.generate_weekly_schedule(bigint)') is null then
    execute $fn$
      create function public.generate_weekly_schedule(p_finance_record_id bigint)
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        finance_row public.finance_records%rowtype;
        installment_count integer;
        installment_amount numeric;
        i integer;
      begin
        select * into finance_row from public.finance_records
        where id = p_finance_record_id for update;
        if not found then
          raise exception 'Finance record not found';
        end if;

        if exists (select 1 from public.repayment_schedule where finance_record_id = p_finance_record_id) then
          return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', 0, 'already_generated', true);
        end if;

        installment_count := coalesce(nullif(split_part(coalesce(finance_row.period, ''), ' ', 1), '')::integer, 0);
        if installment_count <= 0 and finance_row.entry_date is not null and finance_row.ending_date is not null then
          installment_count := greatest(ceil((finance_row.ending_date - finance_row.entry_date)::numeric / 7)::integer, 1);
        end if;
        if installment_count <= 0 then
          raise exception 'Cannot determine the number of weekly installments';
        end if;

        installment_amount := round(coalesce(finance_row.amount, 0) / installment_count, 2);

        for i in 1..installment_count loop
          insert into public.repayment_schedule (
            finance_record_id, installment_number, due_date, due_amount, paid_amount
          ) values (
            p_finance_record_id,
            i,
            finance_row.entry_date + ((i - 1) * 7),
            case when i = installment_count
              then greatest(coalesce(finance_row.amount, 0) - installment_amount * (installment_count - 1), 0)
              else installment_amount
            end,
            0
          );
        end loop;

        return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', installment_count, 'already_generated', false);
      end;
      $body$;
    execute 'grant execute on function public.generate_weekly_schedule(bigint) to authenticated';
  end if;

  if to_regprocedure('public.generate_monthly_schedule(bigint)') is null then
    execute $fn$
      create function public.generate_monthly_schedule(p_finance_record_id bigint)
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        finance_row public.finance_records%rowtype;
        installment_count integer;
        installment_amount numeric;
        i integer;
      begin
        select * into finance_row from public.finance_records
        where id = p_finance_record_id for update;
        if not found then
          raise exception 'Finance record not found';
        end if;

        if exists (select 1 from public.repayment_schedule where finance_record_id = p_finance_record_id) then
          return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', 0, 'already_generated', true);
        end if;

        installment_count := coalesce(nullif(split_part(coalesce(finance_row.period, ''), ' ', 1), '')::integer, 0);
        if installment_count <= 0 then
          raise exception 'Cannot determine the number of monthly installments';
        end if;

        installment_amount := round(coalesce(finance_row.amount, 0) / installment_count, 2);

        for i in 1..installment_count loop
          insert into public.repayment_schedule (
            finance_record_id, installment_number, due_date, due_amount, paid_amount
          ) values (
            p_finance_record_id,
            i,
            (finance_row.entry_date + make_interval(months => i - 1))::date,
            case when i = installment_count
              then greatest(coalesce(finance_row.amount, 0) - installment_amount * (installment_count - 1), 0)
              else installment_amount
            end,
            0
          );
        end loop;

        return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', installment_count, 'already_generated', false);
      end;
      $body$;
    execute 'grant execute on function public.generate_monthly_schedule(bigint) to authenticated';
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- Admin payment posting (daily / weekly / monthly)
-- ---------------------------------------------------------------------------

do $do$
begin
  if to_regprocedure('public.record_daily_payment(bigint, numeric, date)') is null then
    execute $fn$
      create function public.record_daily_payment(
        p_finance_record_id bigint,
        p_payment_amount numeric,
        p_payment_date date
      )
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        result jsonb;
      begin
        result := public.finance_post_scheduled_payment(p_finance_record_id, p_payment_amount, p_payment_date, 'daily');
        return result;
      end;
      $body$;
    execute 'grant execute on function public.record_daily_payment(bigint, numeric, date) to authenticated';
  end if;

  if to_regprocedure('public.record_weekly_payment(bigint, numeric, date)') is null then
    execute $fn$
      create function public.record_weekly_payment(
        p_finance_record_id bigint,
        p_payment_amount numeric,
        p_payment_date date
      )
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        result jsonb;
      begin
        result := public.finance_post_scheduled_payment(p_finance_record_id, p_payment_amount, p_payment_date, 'weekly');
        return result;
      end;
      $body$;
    execute 'grant execute on function public.record_weekly_payment(bigint, numeric, date) to authenticated';
  end if;

  if to_regprocedure('public.record_monthly_payment(bigint, numeric, date)') is null then
    execute $fn$
      create function public.record_monthly_payment(
        p_finance_record_id bigint,
        p_payment_amount numeric,
        p_payment_date date
      )
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        result jsonb;
      begin
        result := public.finance_post_scheduled_payment(p_finance_record_id, p_payment_amount, p_payment_date, 'monthly');
        return result;
      end;
      $body$;
    execute 'grant execute on function public.record_monthly_payment(bigint, numeric, date) to authenticated';
  end if;
end
$do$;

-- Shared implementation for the three admin payment RPCs.
create or replace function public.finance_post_scheduled_payment(
  p_finance_record_id bigint,
  p_payment_amount numeric,
  p_payment_date date,
  p_expected_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  finance_row public.finance_records%rowtype;
  payment_id public.finance_payments.id%type;
  schedule_row record;
  remaining numeric := p_payment_amount;
  applied numeric;
  next_due date;
  balance_before numeric;
  balance_after numeric;
begin
  if auth.uid() is null then
    raise exception 'Login session not found';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and lower(trim(coalesce(role, ''))) = 'admin'
  ) then
    raise exception 'Only an administrator can post this payment';
  end if;

  if p_payment_amount is null or p_payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;

  select * into finance_row from public.finance_records
  where id = p_finance_record_id
    and lower(trim(coalesce(finance_type, ''))) = lower(p_expected_type)
  for update;

  if not found then
    raise exception 'Finance record not found for this loan type';
  end if;

  if lower(trim(coalesce(finance_row.loan_status, ''))) not in ('active', '')
     or coalesce(finance_row.pending, 0) <= 0 then
    raise exception 'Finance record is already closed';
  end if;
  if p_payment_amount > coalesce(finance_row.pending, 0) then
    raise exception 'Payment cannot be more than the pending amount';
  end if;

  balance_before := coalesce(finance_row.pending, 0);
  balance_after := greatest(balance_before - p_payment_amount, 0);

  insert into public.finance_payments (
    user_id, finance_record_id, payment_amount, payment_date, balance_before, balance_after
  ) values (
    auth.uid(), p_finance_record_id, p_payment_amount, p_payment_date, balance_before, balance_after
  ) returning id into payment_id;

  update public.finance_records
  set paid = coalesce(paid, 0) + p_payment_amount,
      pending = balance_after,
      principal_paid = coalesce(principal_paid, 0) + p_payment_amount,
      principal_outstanding = greatest(coalesce(principal_outstanding, 0) - p_payment_amount, 0),
      loan_status = case when balance_after <= 0 then 'closed' else loan_status end,
      next_due_date = case when balance_after <= 0 then null else next_due_date end
  where id = p_finance_record_id;

  for schedule_row in
    select id, due_amount, coalesce(paid_amount, 0) as paid_amount
    from public.repayment_schedule
    where finance_record_id = p_finance_record_id
      and coalesce(paid_amount, 0) < due_amount
    order by installment_number
    for update
  loop
    exit when remaining <= 0;
    applied := least(remaining, schedule_row.due_amount - schedule_row.paid_amount);
    update public.repayment_schedule
    set paid_amount = schedule_row.paid_amount + applied,
        paid_date = p_payment_date
    where id = schedule_row.id;
    remaining := remaining - applied;
  end loop;

  select due_date into next_due
  from public.repayment_schedule
  where finance_record_id = p_finance_record_id
    and coalesce(paid_amount, 0) < due_amount
  order by installment_number
  limit 1;

  update public.finance_records
  set next_due_date = case when coalesce(pending, 0) > 0 then next_due else null end
  where id = p_finance_record_id;

  return jsonb_build_object(
    'payment_id', payment_id,
    'finance_record_id', p_finance_record_id,
    'payment_amount', p_payment_amount,
    'payment_date', p_payment_date,
    'balance_before', balance_before,
    'balance_after', balance_after
  );
end;
$body$;

revoke execute on function public.finance_post_scheduled_payment(bigint, numeric, date, text) from public, anon;
grant execute on function public.finance_post_scheduled_payment(bigint, numeric, date, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 3/3  Collections Realtime  (20261117120000_add_collections_realtime.sql)
-- ----------------------------------------------------------------------------

-- Enable Realtime invalidation for the Collections dashboard.
--
-- This publishes only the tables Collections reads. Supabase Realtime
-- enforces RLS on postgres_changes, so an admin only receives events for
-- rows in their own workspace. The event payload is used purely as an
-- invalidation signal; the browser refetches the canonical data afterwards.
--
-- Safe to re-run: tables are added only when absent from the publication.

do $do$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$do$;

do $do$
declare
  target_table text;
begin
  foreach target_table in array array[
    'finance_records',
    'finance_payments',
    'collection_evidence',
    'category_agent_assignments'
  ] loop
    if to_regclass('public.' || target_table) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = target_table
       )
    then
      execute 'alter publication supabase_realtime add table public.' ||
        quote_ident(target_table);
    end if;
  end loop;
end
$do$;
