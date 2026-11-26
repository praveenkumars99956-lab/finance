-- Live demo hotfix for Weekly/Monthly list edits.
--
-- The live project is missing several functions and one column that the
-- current frontend expects. This script is idempotent: paste it into the
-- Supabase SQL Editor and run it once. It does not change the UI.

-- 1. Monthly Collection Month was being discarded because the column was
--    never added in the live project.
alter table public.finance_records
  add column if not exists collection_month text;

-- 2. Shared legacy-type normalizer. "Weekly Loan" -> weekly,
--    "Monthly Loan" -> monthly. Custom product names stay unchanged.
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

-- 3. Authoritative payment-status lookup. The client cannot read the payment
--    ledger directly, so this security-definer function is the only check the
--    form uses to lock or unlock Already Paid.
create or replace function public.finance_has_posted_payments(p_finance_record_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_role text := public.current_user_role();
  v_type text;
begin
  if auth.uid() is null then
    raise exception 'Login session not found';
  end if;

  if v_role is null or v_role not in ('admin', 'client') then
    raise exception 'Not allowed to inspect this finance record';
  end if;

  perform public.finance_assert_record_workspace(p_finance_record_id);

  select public.finance_normalize_type(finance_type)
  into v_type
  from public.finance_records
  where id = p_finance_record_id;

  if not found then
    raise exception 'Finance record not found';
  end if;

  if v_role = 'client' and v_type not in ('weekly', 'monthly') then
    raise exception 'Not allowed to inspect this finance record';
  end if;

  return exists (
    select 1
    from public.finance_payments
    where finance_record_id = p_finance_record_id
  );
end;
$body$;

revoke all on function public.finance_has_posted_payments(bigint) from public, anon;
grant execute on function public.finance_has_posted_payments(bigint) to authenticated, service_role;

-- 4. Write-boundary guard: once a collection exists, payment totals cannot be
--    rewritten by an edit. Details-only edits remain allowed.
create or replace function public.finance_client_payment_totals_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $body$
begin
  if public.current_user_role() is distinct from 'client' then
    return new;
  end if;

  if (
    new.paid is distinct from old.paid
    or new.principal_paid is distinct from old.principal_paid
    or new.interest_paid is distinct from old.interest_paid
  ) then
    if public.finance_has_posted_payments(old.id) then
      raise exception 'Payment totals cannot be changed after a collection is posted';
    end if;
  end if;

  return new;
end;
$body$;

revoke all on function public.finance_client_payment_totals_guard() from public, anon;

drop trigger if exists finance_30_client_payment_totals_guard on public.finance_records;
create trigger finance_30_client_payment_totals_guard
  before update on public.finance_records
  for each row execute function public.finance_client_payment_totals_guard();

-- 5. Recreate the UPDATE policies so legacy stored types such as
--    "Weekly Loan" and "Monthly Loan" are editable too. Workspace isolation
--    remains enforced by the existing restrictive policy.
drop policy if exists "finance_records_admin_update_guard" on public.finance_records;
drop policy if exists "finance_records_loan_edit_update_guard" on public.finance_records;
drop policy if exists "finance_records_client_update_guard" on public.finance_records;

create policy "finance_records_admin_update_guard"
  on public.finance_records
  as permissive
  for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "finance_records_client_update_guard"
  on public.finance_records
  as permissive
  for update
  to authenticated
  using (
    public.current_user_role() = 'client'
    and public.finance_normalize_type(finance_type) in ('weekly', 'monthly')
  )
  with check (
    public.current_user_role() = 'client'
    and public.finance_normalize_type(finance_type) in ('weekly', 'monthly')
  );

drop policy if exists "repayment_schedule_loan_edit_delete_guard" on public.repayment_schedule;
create policy "repayment_schedule_loan_edit_delete_guard"
  on public.repayment_schedule
  as permissive
  for delete
  to authenticated
  using (
    public.current_user_role() = 'admin'
    or (
      public.current_user_role() = 'client'
      and exists (
        select 1
        from public.finance_records finance
        where finance.id = repayment_schedule.finance_record_id
          and public.finance_normalize_type(finance.finance_type) in ('weekly', 'monthly')
          and not public.finance_has_posted_payments(finance.id)
      )
    )
  );

-- 6. Atomic schedule rebuilds for edits. The old schedule is deleted only
--    after the role, workspace, type, and no-payment checks pass. Clients may
--    rebuild only their own weekly/monthly loans with no posted collections.
create or replace function public.reset_weekly_schedule(p_finance_record_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  finance_row public.finance_records%rowtype;
  v_role text := public.current_user_role();
  installment_count integer;
  payable_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'Login session not found';
  end if;
  if v_role is null or v_role not in ('admin', 'client') then
    raise exception 'Not allowed to reset this schedule';
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
    installment_count := greatest(
      floor((finance_row.ending_date - finance_row.entry_date)::numeric / 7)::integer + 1,
      1
    );
  end if;
  if installment_count <= 0 then
    raise exception 'Cannot determine the number of weekly installments';
  end if;

  -- Weekly Already Paid is informational, so pending is the payable balance.
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
  if public.current_user_role() not in ('admin', 'client') then
    raise exception 'Not allowed to reset this schedule';
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
grant execute on function public.reset_weekly_schedule(bigint) to authenticated, service_role;
grant execute on function public.reset_monthly_schedule(bigint) to authenticated, service_role;
