-- Monthly finance records let the user choose a Collection Month, and the
-- agent collection screen reads it back. The column was never added to the
-- database, so the value was silently discarded on save.
alter table public.finance_records
  add column if not exists collection_month text;

-- Mirror frontend/src/utils/financeType.js. Suffixes are removed only when the
-- result is a known product, so custom types such as "Bridge Loan" and
-- "Bridge Payment" remain distinct. This must exist before the schedule and
-- payment functions below because they validate normalized loan types.
create or replace function public.finance_normalize_type(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  with normalized as (
    select btrim(
      regexp_replace(
        regexp_replace(
          lower(trim(coalesce(p_value, ''))),
          '[[:space:]-]+',
          '_',
          'g'
        ),
        '_+',
        '_',
        'g'
      ),
      '_'
    ) as value
  ), based as (
    select
      value,
      regexp_replace(
        value,
        '_(loans?|collections?|payments?)$',
        ''
      ) as base_value
    from normalized
  )
  select case
    when base_value in ('daily', 'weekly', 'monthly') then base_value
    when base_value in ('interest', 'interestonly', 'interest_only') then 'interest_only'
    else value
  end
  from based;
$$;

revoke all on function public.finance_normalize_type(text) from public, anon;
grant execute on function public.finance_normalize_type(text) to authenticated, service_role;

-- Monthly schedules must follow the payable balance after any "Already Paid"
-- amount. The previous generator divided the full total, which disagreed with
-- the form's remaining amount and allowed the upfront payment to be collected
-- again through the payment RPC.
create or replace function public.generate_monthly_schedule(p_finance_record_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  finance_row public.finance_records%rowtype;
  installment_count integer;
  payable_amount numeric;
  payable_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Login session not found';
  end if;
  if public.current_user_role() <> 'admin' then
    raise exception 'Only an administrator can generate this schedule';
  end if;
  perform public.finance_assert_record_workspace(p_finance_record_id);

  select * into finance_row from public.finance_records
  where id = p_finance_record_id for update;
  if not found then
    raise exception 'Finance record not found';
  end if;
  if public.finance_normalize_type(finance_row.finance_type) <> 'monthly' then
    raise exception 'Finance record is not a monthly loan';
  end if;

  if exists (select 1 from public.repayment_schedule where finance_record_id = p_finance_record_id) then
    return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', 0, 'already_generated', true);
  end if;

  installment_count := coalesce(nullif(split_part(coalesce(finance_row.period, ''), ' ', 1), '')::integer, 0);
  if installment_count <= 0 then
    raise exception 'Cannot determine the number of monthly installments';
  end if;

  payable_amount := greatest(
    coalesce(finance_row.amount, 0) - coalesce(finance_row.paid, 0),
    0
  );

  -- Distribute the payable balance in integer cents so the schedule total is
  -- exactly the payable balance even when it does not divide evenly.
  payable_cents := round(payable_amount * 100)::bigint;
  base_cents := payable_cents / installment_count;
  remainder_cents := payable_cents % installment_count;

  for i in 1..installment_count loop
    insert into public.repayment_schedule (
      finance_record_id, installment_number, due_date, due_amount, paid_amount
    ) values (
      p_finance_record_id,
      i,
      (finance_row.entry_date + make_interval(months => i - 1))::date,
      case when i <= remainder_cents
        then (base_cents + 1)::numeric / 100
        else base_cents::numeric / 100
      end,
      0
    );
  end loop;

  return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', installment_count, 'already_generated', false);
end;
$body$;

revoke all on function public.generate_monthly_schedule(bigint) from public, anon;
grant execute on function public.generate_monthly_schedule(bigint) to authenticated;

-- Atomic schedule rebuild for edits. The old UI deleted the schedule first and
-- then called the admin-only generator; a rejected call (for example from a
-- client-role user) could leave the loan with no schedule. The role check now
-- runs before any delete.
create or replace function public.reset_weekly_schedule(p_finance_record_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  finance_row public.finance_records%rowtype;
  installment_count integer;
  payable_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Login session not found';
  end if;
  if public.current_user_role() <> 'admin' then
    raise exception 'Only an administrator can reset this schedule';
  end if;
  perform public.finance_assert_record_workspace(p_finance_record_id);

  select * into finance_row from public.finance_records
  where id = p_finance_record_id for update;
  if not found then
    raise exception 'Finance record not found';
  end if;
  if public.finance_normalize_type(finance_row.finance_type) <> 'weekly' then
    raise exception 'Finance record is not a weekly loan';
  end if;

  if exists (
    select 1 from public.finance_payments
    where finance_record_id = p_finance_record_id
  ) then
    raise exception 'Schedule cannot be reset after payments have been recorded';
  end if;

  installment_count := coalesce(nullif(split_part(coalesce(finance_row.period, ''), ' ', 1), '')::integer, 0);
  if installment_count <= 0 and finance_row.entry_date is not null and finance_row.ending_date is not null then
    -- The form defines ending_date as start + (weeks - 1) * 7, so the initial
    -- installment must be counted in addition to the weekly intervals.
    installment_count := greatest(
      floor((finance_row.ending_date - finance_row.entry_date)::numeric / 7)::integer + 1,
      1
    );
  end if;
  if installment_count <= 0 then
    raise exception 'Cannot determine the number of weekly installments';
  end if;

  -- Weekly "Already Paid" is informational on create, so `pending` is the
  -- authoritative payable balance for both create and edit rebuilds.
  payable_cents := round(greatest(coalesce(finance_row.pending, 0), 0) * 100)::bigint;
  base_cents := payable_cents / installment_count;
  remainder_cents := payable_cents % installment_count;

  delete from public.repayment_schedule
  where finance_record_id = p_finance_record_id;

  for i in 1..installment_count loop
    insert into public.repayment_schedule (
      finance_record_id, installment_number, due_date, due_amount, paid_amount
    ) values (
      p_finance_record_id,
      i,
      finance_row.entry_date + ((i - 1) * 7),
      case when i <= remainder_cents
        then (base_cents + 1)::numeric / 100
        else base_cents::numeric / 100
      end,
      0
    );
  end loop;

  return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', installment_count, 'already_generated', false);
end;
$body$;

create or replace function public.reset_monthly_schedule(p_finance_record_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  finance_row public.finance_records%rowtype;
  installment_count integer;
  payable_amount numeric;
  payable_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Login session not found';
  end if;
  if public.current_user_role() <> 'admin' then
    raise exception 'Only an administrator can reset this schedule';
  end if;
  perform public.finance_assert_record_workspace(p_finance_record_id);

  select * into finance_row from public.finance_records
  where id = p_finance_record_id for update;
  if not found then
    raise exception 'Finance record not found';
  end if;
  if public.finance_normalize_type(finance_row.finance_type) <> 'monthly' then
    raise exception 'Finance record is not a monthly loan';
  end if;

  if exists (
    select 1 from public.finance_payments
    where finance_record_id = p_finance_record_id
  ) then
    raise exception 'Schedule cannot be reset after payments have been recorded';
  end if;

  installment_count := coalesce(nullif(split_part(coalesce(finance_row.period, ''), ' ', 1), '')::integer, 0);
  if installment_count <= 0 then
    raise exception 'Cannot determine the number of monthly installments';
  end if;

  payable_amount := greatest(
    coalesce(finance_row.amount, 0) - coalesce(finance_row.paid, 0),
    0
  );

  payable_cents := round(payable_amount * 100)::bigint;
  base_cents := payable_cents / installment_count;
  remainder_cents := payable_cents % installment_count;

  delete from public.repayment_schedule
  where finance_record_id = p_finance_record_id;

  for i in 1..installment_count loop
    insert into public.repayment_schedule (
      finance_record_id, installment_number, due_date, due_amount, paid_amount
    ) values (
      p_finance_record_id,
      i,
      (finance_row.entry_date + make_interval(months => i - 1))::date,
      case when i <= remainder_cents
        then (base_cents + 1)::numeric / 100
        else base_cents::numeric / 100
      end,
      0
    );
  end loop;

  return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', installment_count, 'already_generated', false);
end;
$body$;

revoke all on function public.reset_weekly_schedule(bigint) from public, anon;
revoke all on function public.reset_monthly_schedule(bigint) from public, anon;
grant execute on function public.reset_weekly_schedule(bigint) to authenticated;
grant execute on function public.reset_monthly_schedule(bigint) to authenticated;

-- Keep the create path in parity with the reset path: exact cents and an
-- inclusive fallback installment count for legacy rows with a blank period.
create or replace function public.generate_weekly_schedule(p_finance_record_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  finance_row public.finance_records%rowtype;
  installment_count integer;
  payable_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Login session not found';
  end if;
  if public.current_user_role() <> 'admin' then
    raise exception 'Only an administrator can generate this schedule';
  end if;
  perform public.finance_assert_record_workspace(p_finance_record_id);

  select * into finance_row from public.finance_records
  where id = p_finance_record_id for update;
  if not found then
    raise exception 'Finance record not found';
  end if;
  if public.finance_normalize_type(finance_row.finance_type) <> 'weekly' then
    raise exception 'Finance record is not a weekly loan';
  end if;

  if exists (select 1 from public.repayment_schedule where finance_record_id = p_finance_record_id) then
    return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', 0, 'already_generated', true);
  end if;

  installment_count := coalesce(nullif(split_part(coalesce(finance_row.period, ''), ' ', 1), '')::integer, 0);
  if installment_count <= 0 and finance_row.entry_date is not null and finance_row.ending_date is not null then
    installment_count := greatest(
      floor((finance_row.ending_date - finance_row.entry_date)::numeric / 7)::integer + 1,
      1
    );
  end if;
  if installment_count <= 0 then
    raise exception 'Cannot determine the number of weekly installments';
  end if;

  -- Weekly "Already Paid" is informational on create, so `pending` is the
  -- authoritative payable balance for both create and edit rebuilds.
  payable_cents := round(greatest(coalesce(finance_row.pending, 0), 0) * 100)::bigint;
  base_cents := payable_cents / installment_count;
  remainder_cents := payable_cents % installment_count;

  for i in 1..installment_count loop
    insert into public.repayment_schedule (
      finance_record_id, installment_number, due_date, due_amount, paid_amount
    ) values (
      p_finance_record_id,
      i,
      finance_row.entry_date + ((i - 1) * 7),
      case when i <= remainder_cents
        then (base_cents + 1)::numeric / 100
        else base_cents::numeric / 100
      end,
      0
    );
  end loop;

  return jsonb_build_object('finance_record_id', p_finance_record_id, 'installments', installment_count, 'already_generated', false);
end;
$body$;

revoke all on function public.generate_weekly_schedule(bigint) from public, anon;
grant execute on function public.generate_weekly_schedule(bigint) to authenticated;

-- One-time canonicalization, limited to known products so custom types are
-- left untouched. Legacy monthly/weekly rows can carry a schedule generated
-- from the full amount even though part was paid upfront. Reconcile only the
-- outstanding installments so the schedule total matches `pending`; posted
-- installments are preserved and already-correct schedules are not touched.
do $body$
declare
  record_row record;
  current_unpaid numeric;
  unpaid_count integer;
  target_balance numeric;
  target_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
  max_installment integer;
  replacement_count integer;
  installment_index integer;
  installment_number integer;
begin
  for record_row in
    select
      id,
      public.finance_normalize_type(finance_type) as normalized_type,
      pending,
      entry_date,
      period
    from public.finance_records
    where public.finance_normalize_type(finance_type) in ('daily', 'weekly', 'monthly', 'interest_only')
      and finance_type is distinct from public.finance_normalize_type(finance_type)
  loop
    update public.finance_records
    set finance_type = record_row.normalized_type
    where id = record_row.id;

    if record_row.normalized_type not in ('weekly', 'monthly') then
      continue;
    end if;

    select
      coalesce(sum(due_amount - coalesce(paid_amount, 0)), 0),
      count(*)
    into current_unpaid, unpaid_count
    from public.repayment_schedule
    where finance_record_id = record_row.id
      and coalesce(paid_amount, 0) < due_amount;

    target_balance := greatest(coalesce(record_row.pending, 0), 0);

    if abs(current_unpaid - target_balance) < 0.001 then
      continue;
    end if;

    delete from public.repayment_schedule
    where finance_record_id = record_row.id
      and coalesce(paid_amount, 0) < due_amount;

    target_cents := round(target_balance * 100)::bigint;
    if target_cents <= 0 then
      continue;
    end if;

    select coalesce(max(installment_number), 0)
    into max_installment
    from public.repayment_schedule
    where finance_record_id = record_row.id;

    replacement_count := unpaid_count;
    if replacement_count <= 0 then
      replacement_count := coalesce(
        nullif(split_part(coalesce(record_row.period, ''), ' ', 1), '')::integer,
        0
      );
    end if;
    if replacement_count <= 0 then
      replacement_count := 1;
    end if;

    base_cents := target_cents / replacement_count;
    remainder_cents := target_cents % replacement_count;

    for installment_index in 1..replacement_count loop
      installment_number := max_installment + installment_index;

      insert into public.repayment_schedule (
        finance_record_id, installment_number, due_date, due_amount, paid_amount
      ) values (
        record_row.id,
        installment_number,
        case
          when record_row.normalized_type = 'weekly'
            then coalesce(record_row.entry_date, current_date) + ((installment_number - 1) * 7)
          else (coalesce(record_row.entry_date, current_date) + make_interval(months => installment_number - 1))::date
        end,
        case when installment_index <= remainder_cents
          then (base_cents + 1)::numeric / 100
          else base_cents::numeric / 100
        end,
        0
      );
    end loop;
  end loop;
end;
$body$;

-- Payment RPCs previously compared raw strings, so a legacy-typed loan could
-- not be paid even though RLS exposed it to the agent/admin.
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

  if public.current_user_role() <> 'admin' then
    raise exception 'Only an administrator can post this payment';
  end if;

  perform public.finance_assert_record_workspace(p_finance_record_id);

  if p_payment_amount is null or p_payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;

  select * into finance_row from public.finance_records
  where id = p_finance_record_id
    and public.finance_normalize_type(finance_type) = public.finance_normalize_type(p_expected_type)
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

revoke all on function public.finance_post_scheduled_payment(bigint, numeric, date, text) from public, anon;
grant execute on function public.finance_post_scheduled_payment(bigint, numeric, date, text) to authenticated;

-- Agent payments go through the workspace-scoped wrapper installed earlier,
-- which delegates to this unscoped implementation. Legacy spellings must pass
-- the same assignment and interest-only checks as canonical types; replacing
-- the wrapper would drop its workspace assertion.
create or replace function public.finance_unscoped_record_agent_payment(
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
  if p_payment_amount is null or p_payment_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if p_payment_date is null then
    raise exception 'Payment date is required';
  end if;

  select * into agent_row from public.agents
  where auth_user_id = auth.uid() and lower(trim(coalesce(status, ''))) = 'active'
  for update;
  if not found then
    raise exception 'Active agent account not found';
  end if;

  select * into finance_row from public.finance_records
  where id = p_finance_record_id
  for update;
  if not found then
    raise exception 'Finance record not found';
  end if;
  if finance_row.collection_category_id is null then
    raise exception 'Finance record has no collection category';
  end if;

  if not exists (
    select 1 from public.category_agent_assignments assignment
    where assignment.agent_id = agent_row.id
      and assignment.category_id = finance_row.collection_category_id
      and assignment.status = 'active'
      and public.finance_normalize_type(assignment.collection_type) = any (
        array['all', public.finance_normalize_type(finance_row.finance_type)]
      )
  ) then
    raise exception 'Finance record is not assigned to this agent';
  end if;

  if public.finance_normalize_type(finance_row.finance_type) = 'interest_only' then
    -- The interest-only ledger functions still match the canonical spelling.
    -- Normalize the row while it is locked so legacy labels can be paid too.
    update public.finance_records
    set finance_type = 'interest_only'
    where id = p_finance_record_id
      and finance_type is distinct from 'interest_only';

    return public.apply_interest_only_payment(
      auth.uid(),
      p_finance_record_id,
      p_payment_amount,
      p_payment_date
    );
  end if;

  if lower(trim(coalesce(finance_row.loan_status, ''))) not in ('active', '')
     or coalesce(finance_row.pending, 0) <= 0 then
    raise exception 'Finance record is already closed';
  end if;
  if p_payment_amount > coalesce(finance_row.pending, 0) then
    raise exception 'Payment cannot be more than pending amount';
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

notify pgrst, 'reload schema';
