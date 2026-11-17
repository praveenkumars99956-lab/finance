-- Hardening for loan creation and an honest "overdue" definition.
--
-- IMPORTANT: the base schema and permissive RLS policies for these tables are
-- not in this repository (see ANALYSIS.md, P0). This migration is additive and
-- restrictive: it narrows the existing permissive policies, so apply it in a
-- staging project first and confirm admin loan creation still succeeds.

-- ===========================================================================
-- 1. Admin assertion helper (security definer, safe search_path)
-- ===========================================================================

create or replace function public.finance_assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where public.profiles.id = auth.uid()
      and public.profiles.role = 'admin'
  ) then
    raise exception 'Only an administrator may perform this action'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.finance_assert_admin() from public;
grant execute on function public.finance_assert_admin() to authenticated;

-- ===========================================================================
-- 2. Restrictive guards: only admins may create loans/categories
--    (restrictive policies are ANDed with the existing permissive policies)
-- ===========================================================================

drop policy if exists "finance_records_admin_insert_guard"
  on public.finance_records;

create policy "finance_records_admin_insert_guard"
  on public.finance_records
  as restrictive
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where public.profiles.id = auth.uid()
        and public.profiles.role = 'admin'
    )
  );

drop policy if exists "collection_categories_admin_insert_guard"
  on public.collection_categories;

create policy "collection_categories_admin_insert_guard"
  on public.collection_categories
  as restrictive
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where public.profiles.id = auth.uid()
        and public.profiles.role = 'admin'
    )
  );

-- ===========================================================================
-- 3. Overdue view: overdue is a due-date fact, not "pending > 0".
--    security_invoker keeps finance_records RLS in force for the caller.
--    Grace days are read from the caller's workspace settings when present.
-- ===========================================================================

create or replace view public.finance_account_status
with (security_invoker = true)
as
select
  f.*,
  (
    f.loan_status = 'active'
    and f.next_due_date is not null
    and f.next_due_date < (
      current_date - coalesce(settings.overdue_grace_days, 0)
    )
  ) as is_overdue
from public.finance_records f
left join lateral (
  select s.overdue_grace_days
  from public.app_settings s
  where s.workspace_id = f.workspace_id
  order by s.id
  limit 1
) settings on true;

grant select on public.finance_account_status to authenticated;
