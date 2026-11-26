-- Clients could update a weekly/monthly loan but could not read its payment
-- rows, which made the frontend payment lookup return a false empty result.
-- A security-definer lookup establishes absence reliably without widening the
-- client's direct SELECT permissions on the payment ledger. It is defined
-- before the policies below so those policies can use it too.
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

  -- SQL comparisons with NULL never match NOT IN, so reject a roleless
  -- workspace member explicitly.
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

revoke all on function public.finance_has_posted_payments(bigint)
  from public, anon;
grant execute on function public.finance_has_posted_payments(bigint)
  to authenticated, service_role;

-- The form locks Already Paid after collections are posted. Enforce the same
-- rule at the write boundary so a direct client UPDATE cannot rewrite payment
-- totals once a real collection exists.
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

  -- Check the changed columns first so details-only updates to non-loan
  -- records never call the loan-only payment helper.
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

revoke all on function public.finance_client_payment_totals_guard()
  from public, anon;

drop trigger if exists finance_30_client_payment_totals_guard
  on public.finance_records;

create trigger finance_30_client_payment_totals_guard
  before update on public.finance_records
  for each row execute function public.finance_client_payment_totals_guard();

-- Client loan edits were rejected by RLS when a legacy finance_type value such
-- as "Monthly Loan" was stored. Every other finance policy uses
-- finance_normalize_type(); the update and schedule-delete policies must do the
-- same so a saved Weekly/Monthly loan can actually be edited.
drop policy if exists "finance_records_client_update_guard"
  on public.finance_records;

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

drop policy if exists "repayment_schedule_loan_edit_delete_guard"
  on public.repayment_schedule;

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
