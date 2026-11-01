-- Agents must not be able to enumerate other agents or admin settlement data.
drop policy if exists "Authenticated users can view agents"
  on public.agents;

create policy "Agents can view own agent record"
  on public.agents
  for select
  to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists "Authenticated users can view settlements"
  on public.agent_settlements;

create policy "Agents can view own settlements"
  on public.agent_settlements
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where public.profiles.id = auth.uid()
        and public.profiles.role = 'admin'
    )
    or exists (
      select 1
      from public.agents
      where public.agents.id = agent_settlements.agent_id
        and public.agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can update settlements"
  on public.agent_settlements;

create policy "Agents can update own settlements"
  on public.agent_settlements
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.agents
      where public.agents.id = agent_settlements.agent_id
        and public.agents.auth_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.agents
      where public.agents.id = agent_settlements.agent_id
        and public.agents.auth_user_id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can view collection evidence"
  on public.collection_evidence;

create policy "Agents can view own collection evidence"
  on public.collection_evidence
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where public.profiles.id = auth.uid()
        and public.profiles.role = 'admin'
    )
    or exists (
      select 1
      from public.agents
      where public.agents.id = collection_evidence.agent_id
        and public.agents.auth_user_id = auth.uid()
    )
    or created_by = auth.uid()
  );
