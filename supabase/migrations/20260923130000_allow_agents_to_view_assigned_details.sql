-- Agents need the related customer and category details shown with assigned loans.
drop policy if exists "Agents can view assigned customers"
  on public.customers;

create policy "Agents can view assigned customers"
  on public.customers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.finance_records finance
      join public.category_agent_assignments assignment
        on assignment.category_id = finance.collection_category_id
      join public.agents agent
        on agent.id = assignment.agent_id
      where finance.customer_id = customers.id
        and assignment.status = 'active'
        and agent.auth_user_id = auth.uid()
        and lower(trim(coalesce(assignment.collection_type, 'all'))) in (
          'all',
          lower(trim(coalesce(finance.finance_type, '')))
        )
    )
  );

drop policy if exists "Agents can view assigned categories"
  on public.collection_categories;

create policy "Agents can view assigned categories"
  on public.collection_categories
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.finance_records finance
      join public.category_agent_assignments assignment
        on assignment.category_id = finance.collection_category_id
      join public.agents agent
        on agent.id = assignment.agent_id
      where finance.collection_category_id = collection_categories.id
        and assignment.status = 'active'
        and agent.auth_user_id = auth.uid()
        and lower(trim(coalesce(assignment.collection_type, 'all'))) in (
          'all',
          lower(trim(coalesce(finance.finance_type, '')))
        )
    )
  );
