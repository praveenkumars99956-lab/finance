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
