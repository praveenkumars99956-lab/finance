-- Agents need to see the payment history for collections they are authorized to manage.
drop policy if exists "Agents can view assigned payments"
  on public.finance_payments;

create policy "Agents can view assigned payments"
  on public.finance_payments
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
      where finance.id = finance_payments.finance_record_id
        and assignment.status = 'active'
        and agent.auth_user_id = auth.uid()
        and lower(trim(coalesce(assignment.collection_type, 'all'))) in (
          'all',
          lower(trim(coalesce(finance.finance_type, '')))
        )
    )
  );
