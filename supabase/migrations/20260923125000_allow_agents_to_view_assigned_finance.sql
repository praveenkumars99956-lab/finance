-- Agents may read active finance records for categories assigned to them.
-- Collection type filtering remains enforced by the frontend and collection access checks.
drop policy if exists "Agents can view assigned finance records"
  on public.finance_records;

create policy "Agents can view assigned finance records"
  on public.finance_records
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.category_agent_assignments assignment
      join public.agents agent
        on agent.id = assignment.agent_id
      where assignment.category_id = finance_records.collection_category_id
        and assignment.status = 'active'
        and agent.auth_user_id = auth.uid()
        and lower(trim(coalesce(assignment.collection_type, 'all'))) in (
          'all',
          lower(trim(coalesce(finance_records.finance_type, '')))
        )
    )
  );
