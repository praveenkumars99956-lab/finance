-- The 20261120 update policies resolve roles with current_user_role()
-- (authoritative email binding first), but the 20261111 insert guards still
-- read profiles.role. An admin whose email binding is current but whose
-- profiles.role is stale can update a loan/category yet cannot create one.
-- Recreate both restrictive insert guards using the same role source.
--
-- Restrictive policies are ANDed with the existing permissive policies, so
-- this only changes which role is consulted; it does not add new access.
-- Client-role loan creation remains blocked, as before.

drop policy if exists "finance_records_admin_insert_guard"
  on public.finance_records;

create policy "finance_records_admin_insert_guard"
  on public.finance_records
  as restrictive
  for insert
  to authenticated
  with check (
    public.current_user_role() = 'admin'
  );

drop policy if exists "collection_categories_admin_insert_guard"
  on public.collection_categories;

create policy "collection_categories_admin_insert_guard"
  on public.collection_categories
  as restrictive
  for insert
  to authenticated
  with check (
    public.current_user_role() = 'admin'
  );

-- Keep the admin assertion helper consistent with the RLS policies. It is
-- defined here because older projects may call it from baseline triggers.
create or replace function public.finance_assert_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only an administrator may perform this action'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.finance_assert_admin() from public;
grant execute on function public.finance_assert_admin() to authenticated;
