-- Record a payment for an assigned finance account.
-- This is separate from the admin/owner payment RPCs because agents are
-- authorized by category assignment rather than finance_records.user_id.
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
begin
  if p_payment_amount is null or p_payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;

  select *
  into agent_row
  from public.agents
  where auth_user_id = auth.uid()
    and lower(trim(coalesce(status, ''))) = 'active'
  for update;

  if not found then
    raise exception 'Active agent account not found';
  end if;

  select *
  into finance_row
  from public.finance_records
  where id = p_finance_record_id
  for update;

  if not found then
    raise exception 'Finance record not found';
  end if;

  if finance_row.collection_category_id is null then
    raise exception 'Finance record has no collection category';
  end if;

  if not exists (
    select 1
    from public.category_agent_assignments assignment
    where assignment.agent_id = agent_row.id
      and assignment.category_id = finance_row.collection_category_id
      and assignment.status = 'active'
      and lower(trim(coalesce(assignment.collection_type, 'all'))) in (
        'all',
        lower(trim(coalesce(finance_row.finance_type, '')))
      )
  ) then
    raise exception 'Finance record is not assigned to this agent';
  end if;

  if lower(trim(coalesce(finance_row.loan_status, ''))) not in ('active', '')
     or coalesce(finance_row.pending, 0) <= 0 then
    raise exception 'Finance record is already closed';
  end if;

  if p_payment_amount > coalesce(finance_row.pending, 0) then
    raise exception 'Payment cannot be more than the pending amount';
  end if;

  insert into public.finance_payments (
    user_id,
    finance_record_id,
    payment_amount,
    payment_date
  ) values (
    auth.uid(),
    p_finance_record_id,
    p_payment_amount,
    p_payment_date
  )
  returning id into payment_id;

  update public.finance_records
  set paid = coalesce(paid, 0) + p_payment_amount,
      pending = greatest(coalesce(pending, 0) - p_payment_amount, 0),
      principal_paid = coalesce(principal_paid, 0) + p_payment_amount,
      principal_outstanding = greatest(coalesce(principal_outstanding, 0) - p_payment_amount, 0),
      loan_status = case
        when greatest(coalesce(pending, 0) - p_payment_amount, 0) <= 0 then 'closed'
        else loan_status
      end,
      next_due_date = case
        when greatest(coalesce(pending, 0) - p_payment_amount, 0) <= 0 then null
        else next_due_date
      end
  where id = p_finance_record_id;

  -- Apply the payment to installments in order, including partial payments.
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

  select due_date
  into next_due
  from public.repayment_schedule
  where finance_record_id = p_finance_record_id
    and coalesce(paid_amount, 0) < due_amount
  order by installment_number
  limit 1;

  update public.finance_records
  set next_due_date = case
    when coalesce(pending, 0) > 0 then next_due
    else null
  end
  where id = p_finance_record_id;

  return jsonb_build_object(
    'payment_id', payment_id,
    'finance_record_id', p_finance_record_id,
    'payment_amount', p_payment_amount,
    'payment_date', p_payment_date
  );
end;
$$;

revoke execute on function public.record_agent_payment(bigint, numeric, date)
from public, anon;

grant execute on function public.record_agent_payment(bigint, numeric, date)
to authenticated;
