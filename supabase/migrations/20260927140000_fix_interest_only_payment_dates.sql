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
  interest_after numeric;
  balance_before numeric;
  balance_after numeric;
  elapsed_days integer;
  last_interest_date date;
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

  if p_payment_date > current_date then
    raise exception 'Payment date cannot be in the future';
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

  principal_balance := greatest(coalesce(
    finance_row.principal_outstanding,
    finance_row.original_principal,
    finance_row.principal_amount,
    0
  ), 0);
  rate := greatest(coalesce(finance_row.interest_rate, 0), 0);
  last_interest_date := coalesce(finance_row.last_interest_date, finance_row.entry_date, p_payment_date);

  if p_payment_date < last_interest_date then
    raise exception 'Payment date cannot be earlier than the last interest date';
  end if;

  elapsed_days := p_payment_date - last_interest_date;
  accrued_interest := round(principal_balance * rate * elapsed_days / 3000, 2);
  interest_balance := greatest(coalesce(finance_row.interest_due, 0), 0) + accrued_interest;

  if p_payment_amount > interest_balance then
    raise exception 'Interest payment cannot exceed accrued interest due: %', interest_balance;
  end if;

  balance_before := principal_balance + interest_balance;
  interest_after := interest_balance - p_payment_amount;
  balance_after := principal_balance + interest_after;

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
    p_payment_amount,
    0
  ) returning id into payment_id;

  update public.finance_records
  set amount = coalesce(amount, principal_balance),
      paid = coalesce(paid, 0) + p_payment_amount,
      pending = balance_after,
      interest_accrual = coalesce(interest_accrual, 0) + accrued_interest,
      interest_due = interest_after,
      interest_paid = coalesce(interest_paid, 0) + p_payment_amount,
      principal_outstanding = principal_balance,
      last_interest_date = p_payment_date,
      next_due_date = case
        when balance_after <= 0 or principal_balance <= 0 then null
        else p_payment_date + 30
      end,
      loan_status = case when balance_after <= 0 then 'closed' else 'active' end
  where id = p_finance_record_id;

  return jsonb_build_object(
    'payment_id', payment_id,
    'finance_record_id', p_finance_record_id,
    'payment_amount', p_payment_amount,
    'payment_date', p_payment_date,
    'interest_accrued', accrued_interest,
    'interest_payment', p_payment_amount,
    'principal_payment', 0,
    'principal_outstanding', principal_balance,
    'balance_before', balance_before,
    'balance_after', balance_after
  );
end;
$$;

notify pgrst, 'reload schema';