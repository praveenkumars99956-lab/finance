-- Agents need to read only the assignments linked to their authenticated account.
-- Admin-only write access remains unchanged.
drop policy if exists "Agents can view own category assignments"
  on public.category_agent_assignments;

create policy "Agents can view own category assignments"
  on public.category_agent_assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.agents
      where public.agents.id = category_agent_assignments.agent_id
        and public.agents.auth_user_id = auth.uid()
    )
  );
