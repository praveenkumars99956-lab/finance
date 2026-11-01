create or replace function public.rebuild_interest_only_ledger(
  p_finance_record_id bigint,
  p_new_payment_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  finance_row public.finance_records%rowtype;
  ledger_event record;
  principal_balance numeric;
  principal_before numeric;
  interest_due numeric := 0;
  interest_accrued numeric;
  event_interest_payment numeric;
  event_principal_payment numeric;
  total_interest_accrued numeric := 0;
  total_interest_paid numeric := 0;
  total_principal_paid numeric := 0;
  total_paid numeric := 0;
  balance_before numeric;
  balance_after numeric;
  rate numeric;
  last_event_date date;
  elapsed_days integer;
begin
  select * into finance_row
  from public.finance_records
  where id = p_finance_record_id
    and lower(trim(coalesce(finance_type, ''))) = 'interest_only'
  for update;

  if not found then
    raise exception 'Interest-Only finance record not found';
  end if;

  principal_balance := greatest(coalesce(
    finance_row.original_principal,
    finance_row.principal_amount,
    finance_row.amount,
    0
  ), 0);
  rate := greatest(coalesce(finance_row.interest_rate, 0), 0);
  last_event_date := coalesce(finance_row.entry_date, finance_row.payment_date, current_date);

  for ledger_event in
    select event_data.*
    from (
      select
        payment.payment_date as event_date,
        payment.created_at as event_created_at,
        'payment'::text as event_type,
        payment.id as event_id,
        payment.payment_amount,
        payment.interest_payment,
        payment.principal_payment,
        null::text as adjustment_type,
        null::numeric as adjustment_amount
      from public.finance_payments payment
      where payment.finance_record_id = p_finance_record_id

      union all

      select
        adjustment.adjustment_date as event_date,
        adjustment.created_at as event_created_at,
        'adjustment'::text as event_type,
        adjustment.id as event_id,
        null::numeric as payment_amount,
        null::numeric as interest_payment,
        null::numeric as principal_payment,
        adjustment.adjustment_type,
        adjustment.adjustment_amount
      from public.finance_principal_adjustments adjustment
      where adjustment.finance_record_id = p_finance_record_id
    ) event_data
    order by event_data.event_date, event_data.event_created_at, event_data.event_type, event_data.event_id
  loop
    if ledger_event.event_date < last_event_date then
      raise exception 'Ledger contains an event dated before the loan start date';
    end if;

    elapsed_days := ledger_event.event_date - last_event_date;
    interest_accrued := round(principal_balance * rate * elapsed_days / 3000, 2);
    interest_due := interest_due + interest_accrued;
    total_interest_accrued := total_interest_accrued + interest_accrued;
    last_event_date := ledger_event.event_date;

    if ledger_event.event_type = 'adjustment' then
      principal_before := principal_balance;

      if ledger_event.adjustment_type = 'increase' then
        principal_balance := principal_balance + ledger_event.adjustment_amount;
      else
        if ledger_event.adjustment_amount > principal_balance then
          raise exception 'A historical principal reduction exceeds the balance at its date';
        end if;
        principal_balance := principal_balance - ledger_event.adjustment_amount;
      end if;

      update public.finance_principal_adjustments
      set principal_before = principal_before,
          principal_after = principal_balance
      where id = ledger_event.event_id;
    else
      event_interest_payment := coalesce(ledger_event.interest_payment, 0);
      event_principal_payment := coalesce(ledger_event.principal_payment, 0);

      if ledger_event.event_id = p_new_payment_id then
        event_interest_payment := ledger_event.payment_amount;
        event_principal_payment := 0;
      elsif event_interest_payment + event_principal_payment <> ledger_event.payment_amount then
        raise exception 'Backdating is unavailable because a historical payment has no interest/principal allocation';
      end if;

      if event_interest_payment > interest_due then
        if ledger_event.event_id = p_new_payment_id then
          raise exception 'Payment exceeds accrued interest on the selected date: %', interest_due;
        end if;
        raise exception 'This backdated payment would make a later interest payment exceed accrued interest';
      end if;

      if event_principal_payment > principal_balance then
        raise exception 'A historical principal payment exceeds the balance at its date';
      end if;

      balance_before := principal_balance + interest_due;
      interest_due := interest_due - event_interest_payment;
      principal_balance := principal_balance - event_principal_payment;
      balance_after := principal_balance + interest_due;

      update public.finance_payments
      set balance_before = balance_before,
          balance_after = balance_after,
          interest_payment = event_interest_payment,
          principal_payment = event_principal_payment
      where id = ledger_event.event_id;

      total_interest_paid := total_interest_paid + event_interest_payment;
      total_principal_paid := total_principal_paid + event_principal_payment;
      total_paid := total_paid + ledger_event.payment_amount;
    end if;
  end loop;

  balance_after := principal_balance + interest_due;

  update public.finance_records
  set paid = total_paid,
      pending = balance_after,
      interest_accrual = total_interest_accrued,
      interest_due = interest_due,
      interest_paid = total_interest_paid,
      principal_paid = total_principal_paid,
      principal_outstanding = principal_balance,
      last_interest_date = last_event_date,
      next_due_date = case when balance_after > 0 then last_event_date + 30 else null end,
      loan_status = case when balance_after <= 0 then 'closed' else 'active' end
  where id = p_finance_record_id;

  return jsonb_build_object(
    'finance_record_id', p_finance_record_id,
    'paid', total_paid,
    'pending', balance_after,
    'interest_due', interest_due,
    'principal_outstanding', principal_balance,
    'last_interest_date', last_event_date
  );
end;
$$;

revoke execute on function public.rebuild_interest_only_ledger(bigint, bigint)
  from public, anon, authenticated;

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
  replay_result jsonb;
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

  if p_payment_date < coalesce(finance_row.entry_date, finance_row.payment_date) then
    raise exception 'Payment date cannot be earlier than the loan start date';
  end if;

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
    0,
    0,
    p_payment_amount,
    0
  ) returning id into payment_id;

  replay_result := public.rebuild_interest_only_ledger(p_finance_record_id, payment_id);

  return replay_result || jsonb_build_object(
    'payment_id', payment_id,
    'payment_amount', p_payment_amount,
    'payment_date', p_payment_date,
    'interest_payment', p_payment_amount,
    'principal_payment', 0
  );
end;
$$;

revoke execute on function public.apply_interest_only_payment(uuid, bigint, numeric, date)
  from public, anon, authenticated;
grant execute on function public.apply_interest_only_payment(uuid, bigint, numeric, date)
  to authenticated;

notify pgrst, 'reload schema';