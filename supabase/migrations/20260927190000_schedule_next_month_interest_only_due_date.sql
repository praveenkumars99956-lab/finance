create or replace function public.schedule_interest_only_due_date(
  p_finance_record_id bigint,
  p_due_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  finance_row public.finance_records%rowtype;
  profile_role text;
  first_day_next_month date := (date_trunc('month', current_date) + interval '1 month')::date;
  last_day_next_month date := (date_trunc('month', current_date) + interval '2 months' - interval '1 day')::date;
begin
  select lower(trim(coalesce(role, '')))
  into profile_role
  from public.profiles
  where id = auth.uid();

  if coalesce(profile_role, '') <> 'admin' then
    raise exception 'Admin access is required to schedule Interest-Only payments';
  end if;

  if p_due_date is null or p_due_date < first_day_next_month or p_due_date > last_day_next_month then
    raise exception 'Choose a due date in the next calendar month (% through %)', first_day_next_month, last_day_next_month;
  end if;

  select * into finance_row
  from public.finance_records
  where id = p_finance_record_id
    and lower(trim(coalesce(finance_type, ''))) = 'interest_only'
  for update;

  if not found then
    raise exception 'Interest-Only finance record not found';
  end if;

  if lower(trim(coalesce(finance_row.loan_status, ''))) not in ('active', '') then
    raise exception 'Closed Interest-Only loans cannot be scheduled';
  end if;

  update public.finance_records
  set next_due_date = p_due_date
  where id = p_finance_record_id;

  return jsonb_build_object(
    'finance_record_id', p_finance_record_id,
    'next_due_date', p_due_date,
    'scheduled_interest_amount', round(greatest(coalesce(finance_row.principal_outstanding, 0), 0) * greatest(coalesce(finance_row.interest_rate, 0), 0) / 100, 2)
  );
end;
$$;

revoke execute on function public.schedule_interest_only_due_date(bigint, date)
  from public, anon;
grant execute on function public.schedule_interest_only_due_date(bigint, date)
  to authenticated;