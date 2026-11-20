-- Collection category edits were silently doing nothing: an UPDATE blocked
-- by RLS returns success with zero affected rows, so the UI reported success
-- while the list kept showing the old values. There is an admin INSERT guard
-- but no permissive UPDATE policy for this table.
--
-- Use current_user_role() (email binding first) rather than profiles.role,
-- which is not kept in sync when a role binding changes.
drop policy if exists "collection_categories_admin_update_guard"
  on public.collection_categories;

create policy "collection_categories_admin_update_guard"
  on public.collection_categories
  as permissive
  for update
  to authenticated
  using (
    public.current_user_role() = 'admin'
  )
  with check (
    public.current_user_role() = 'admin'
  );
