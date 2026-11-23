-- ============================================================================
-- Harden email-bound RBAC and finance RPCs
-- ----------------------------------------------------------------------------
-- Follow-ups from the access/data review:
--   * current_user_role() no longer falls back to a stale profiles.role.
--   * Workspace scope comes from the active email binding first.
--   * New admin/agent logins receive a role_bindings row in their edge
--     functions (see supabase/functions/create-*/index.ts).
--   * finance_normalize_type() mirrors the frontend legacy-type normalizer.
--   * Schedule generators and payment posting require a login, an email-bound
--     admin role, and a workspace assertion before touching any finance row.
--   * EXECUTE grants are unconditional so a repaired grant survives reapply.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fail-closed server role
-- ---------------------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_role text;
begin
  if v_email <> '' then
    select lower(trim(rb.role))
      into v_role
      from public.role_bindings rb
     where rb.email = v_email
       and rb.active
     order by rb.updated_at desc
     limit 1;

    if v_role is not null then
      return v_role;
    end if;

    -- An active email binding is required for any privileged role. A missing
    -- or deactivated binding means "client", even if profiles.role is stale.
    return 'client';
  end if;

  return 'client';
end;
$$;

comment on function public.current_user_role() is
  'Authoritative role for the current session from the active email binding; fails closed to client when no binding exists.';

revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Workspace scope: active email binding wins over the profile
-- ---------------------------------------------------------------------------

create or replace function public.finance_current_workspace_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_binding boolean := false;
  v_binding_workspace uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  select true, rb.workspace_id
    into v_has_binding, v_binding_workspace
    from public.role_bindings rb
   where rb.email = lower(coalesce(auth.jwt() ->> 'email', ''))
     and rb.active
   order by rb.updated_at desc
   limit 1;

  if v_has_binding then
    return coalesce(
      v_binding_workspace,
      '00000000-0000-4000-8000-000000000001'::uuid
    );
  end if;

  -- No active binding: privileged roles are already denied by current_user_role().
  -- Keep the historic scope for clients so their permissions do not change.
  return coalesce(
    (
      select p.workspace_id
      from public.profiles p
      where p.id = auth.uid()
    ),
    '00000000-0000-4000-8000-000000000001'::uuid
  );
end;
$$;

revoke all on function public.finance_current_workspace_id() from public, anon;
grant execute on function public.finance_current_workspace_id() to authenticated, service_role;

-- When a binding is deactivated, changed or removed, bring the profile in line
-- so stale profile values cannot be used by legacy code paths.
create or replace function public.profiles_sync_role_binding()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_role text;
begin
  if tg_op = 'DELETE' then
    v_user_id := (
      select u.id from auth.users u
      where lower(u.email) = lower(old.email)
    );
    v_role := 'client';
  else
    v_user_id := (
      select u.id from auth.users u
      where lower(u.email) = lower(new.email)
    );
    v_role := case
      when new.active then lower(trim(new.role))
      else 'client'
    end;
  end if;

  if v_user_id is not null then
    update public.profiles p
       set role = v_role
     where p.id = v_user_id
       and lower(coalesce(p.role, '')) is distinct from v_role;
  end if;

  return null;
end;
$$;

drop trigger if exists role_bindings_sync_profile_role on public.role_bindings;
create trigger role_bindings_sync_profile_role
  after update of active, role or delete on public.role_bindings
  for each row execute function public.profiles_sync_role_binding();

-- ---------------------------------------------------------------------------
-- 3. Finance type normalizer matching frontend/src/utils/financeType.js
-- ---------------------------------------------------------------------------

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
          '[\s-]+',
          '_',
          'g'
        ),
        '_+',
        '_',
        'g'
      ),
      '_'
    ) as value
  ),
  based as (
    select regexp_replace(
      value,
      '_(loans?|collections?|payments?)$',
      ''
    ) as value
    from normalized
  )
  select case value
    when 'interest' then 'interest_only'
    when 'interestonly' then 'interest_only'
    when 'interest_only' then 'interest_only'
    else value
  end
  from based;
$$;

revoke all on function public.finance_normalize_type(text) from public, anon;
grant execute on function public.finance_normalize_type(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Guarded schedule generators
-- ---------------------------------------------------------------------------

create or replace function public.generate_daily_schedule(p_finance_record_id bigint)
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

create or replace function public.generate_weekly_schedule(p_finance_record_id bigint)
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

create or replace function public.generate_monthly_schedule(p_finance_record_id bigint)
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

revoke all on function public.generate_daily_schedule(bigint) from public, anon;
revoke all on function public.generate_weekly_schedule(bigint) from public, anon;
revoke all on function public.generate_monthly_schedule(bigint) from public, anon;

grant execute on function public.generate_daily_schedule(bigint) to authenticated;
grant execute on function public.generate_weekly_schedule(bigint) to authenticated;
grant execute on function public.generate_monthly_schedule(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Guarded payment posting
-- ---------------------------------------------------------------------------

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

revoke all on function public.finance_post_scheduled_payment(bigint, numeric, date, text) from public, anon;
grant execute on function public.finance_post_scheduled_payment(bigint, numeric, date, text) to authenticated;
