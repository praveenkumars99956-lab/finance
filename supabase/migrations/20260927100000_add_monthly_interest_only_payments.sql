alter table public.finance_payments
  add column if not exists interest_payment numeric not null default 0,
  add column if not exists principal_payment numeric not null default 0;

create or replace function public.apply_interest_only_payment(
  p_user_id uuid,
  p_finance_record_id bigint,
  p_payment_amount numeric,
  p_payment_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  finance_row public.finance_records%rowtype;
  payment_id public.finance_payments.id%type;
  principal_balance numeric;
  rate numeric;
  accrued_interest numeric;
  interest_balance numeric;
  interest_payment numeric;
  principal_payment numeric;
  principal_after numeric;
  interest_after numeric;
  balance_before numeric;
  balance_after numeric;
  elapsed_days integer;
begin
  if p_user_id is null then
    raise exception 'Login session not found';
  end if;

  if p_payment_amount is null or p_payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required';
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
    raise exception 'Interest-Only loan is already closed';
  end if;

  principal_balance := greatest(coalesce(finance_row.principal_outstanding, 0), 0);
  rate := greatest(coalesce(finance_row.interest_rate, 0), 0);

  if principal_balance <= 0 then
    raise exception 'Interest-Only loan has no principal outstanding';
  end if;

  if p_payment_date < coalesce(finance_row.last_interest_date, finance_row.entry_date, p_payment_date) then
    raise exception 'Payment date cannot be earlier than the last interest date';
  end if;

  elapsed_days := p_payment_date - coalesce(finance_row.last_interest_date, finance_row.entry_date, p_payment_date);
  accrued_interest := round(principal_balance * rate * elapsed_days / 3000, 2);
  interest_balance := greatest(coalesce(finance_row.interest_due, 0), 0) + accrued_interest;
  balance_before := principal_balance + interest_balance;

  if p_payment_amount > balance_before then
    raise exception 'Payment cannot be more than the balance due on the payment date: %', balance_before;
  end if;

  interest_payment := least(p_payment_amount, interest_balance);
  principal_payment := least(principal_balance, p_payment_amount - interest_payment);
  principal_after := principal_balance - principal_payment;
  interest_after := interest_balance - interest_payment;
  balance_after := principal_after + interest_after;

  insert into public.finance_payments (
    user_id,
    finance_record_id,
    payment_amount,
    payment_date,
    balance_before,
    balance_after,
    interest_payment,
    principal_payment
  ) values (
    p_user_id,
    p_finance_record_id,
    p_payment_amount,
    p_payment_date,
    balance_before,
    balance_after,
    interest_payment,
    principal_payment
  ) returning id into payment_id;

  update public.finance_records
  set amount = coalesce(amount, principal_balance),
      paid = coalesce(paid, 0) + p_payment_amount,
      pending = balance_after,
      interest_accrual = coalesce(interest_accrual, 0) + accrued_interest,
      interest_due = interest_after,
      interest_paid = coalesce(interest_paid, 0) + interest_payment,
      principal_paid = coalesce(principal_paid, 0) + principal_payment,
      principal_outstanding = principal_after,
      last_interest_date = p_payment_date,
      next_due_date = case when balance_after <= 0 then null else p_payment_date + 30 end,
      loan_status = case when balance_after <= 0 then 'closed' else 'active' end
  where id = p_finance_record_id;

  return jsonb_build_object(
    'payment_id', payment_id,
    'finance_record_id', p_finance_record_id,
    'payment_amount', p_payment_amount,
    'payment_date', p_payment_date,
    'interest_accrued', accrued_interest,
    'interest_payment', interest_payment,
    'principal_payment', principal_payment,
    'balance_before', balance_before,
    'balance_after', balance_after
  );
end;
$$;

revoke execute on function public.apply_interest_only_payment(uuid, bigint, numeric, date)
  from public, anon, authenticated;

drop function if exists public.record_interest_only_payment(bigint, numeric, date);

create or replace function public.record_interest_only_payment(
  p_finance_record_id bigint,
  p_payment_amount numeric,
  p_payment_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_role text;
begin
  select lower(trim(coalesce(role, '')))
  into profile_role
  from public.profiles
  where id = auth.uid();

  if coalesce(profile_role, '') <> 'admin' then
    raise exception 'Admin access is required to record this payment';
  end if;

  return public.apply_interest_only_payment(
    auth.uid(),
    p_finance_record_id,
    p_payment_amount,
    p_payment_date
  );
end;
$$;

revoke execute on function public.record_interest_only_payment(bigint, numeric, date)
  from public, anon;
grant execute on function public.record_interest_only_payment(bigint, numeric, date)
  to authenticated;

create or replace function public.record_agent_payment(
  p_finance_record_id bigint,
  p_payment_amount numeric,
  p_payment_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  finance_row public.finance_records%rowtype;
  agent_row public.agents%rowtype;
  payment_id public.finance_payments.id%type;
  schedule_row record;
  remaining numeric := p_payment_amount;
  applied numeric;
  next_due date;
  balance_before numeric;
  balance_after numeric;
begin
  if p_payment_amount is null or p_payment_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_payment_date is null then raise exception 'Payment date is required'; end if;

  select * into agent_row from public.agents
  where auth_user_id = auth.uid() and lower(trim(coalesce(status, ''))) = 'active'
  for update;
  if not found then raise exception 'Active agent account not found'; end if;

  select * into finance_row from public.finance_records
  where id = p_finance_record_id
  for update;
  if not found then raise exception 'Finance record not found'; end if;
  if finance_row.collection_category_id is null then raise exception 'Finance record has no collection category'; end if;

  if not exists (
    select 1 from public.category_agent_assignments assignment
    where assignment.agent_id = agent_row.id
      and assignment.category_id = finance_row.collection_category_id
      and assignment.status = 'active'
      and lower(trim(coalesce(assignment.collection_type, 'all'))) in ('all', lower(trim(coalesce(finance_row.finance_type, ''))))
  ) then raise exception 'Finance record is not assigned to this agent'; end if;

  if lower(trim(coalesce(finance_row.finance_type, ''))) = 'interest_only' then
    return public.apply_interest_only_payment(
      auth.uid(),
      p_finance_record_id,
      p_payment_amount,
      p_payment_date
    );
  end if;

  if lower(trim(coalesce(finance_row.loan_status, ''))) not in ('active', '') or coalesce(finance_row.pending, 0) <= 0 then
    raise exception 'Finance record is already closed';
  end if;
  if p_payment_amount > coalesce(finance_row.pending, 0) then raise exception 'Payment cannot be more than pending amount'; end if;

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
    where finance_record_id = p_finance_record_id and coalesce(paid_amount, 0) < due_amount
    order by installment_number
    for update
  loop
    exit when remaining <= 0;
    applied := least(remaining, schedule_row.due_amount - schedule_row.paid_amount);
    update public.repayment_schedule
    set paid_amount = schedule_row.paid_amount + applied, paid_date = p_payment_date
    where id = schedule_row.id;
    remaining := remaining - applied;
  end loop;

  select due_date into next_due from public.repayment_schedule
  where finance_record_id = p_finance_record_id and coalesce(paid_amount, 0) < due_amount
  order by installment_number limit 1;

  update public.finance_records
  set next_due_date = case when coalesce(pending, 0) > 0 then next_due else null end
  where id = p_finance_record_id;

  return jsonb_build_object('payment_id', payment_id, 'finance_record_id', p_finance_record_id,
    'payment_amount', p_payment_amount, 'payment_date', p_payment_date,
    'balance_before', balance_before, 'balance_after', balance_after);
end;
$$;

revoke execute on function public.record_agent_payment(bigint, numeric, date) from public, anon;
grant execute on function public.record_agent_payment(bigint, numeric, date) to authenticated;