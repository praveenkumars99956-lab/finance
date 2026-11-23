-- Collection evidence is written by both the admin collection UI and the
-- agent portal. Only a SELECT policy existed in version control, so on a
-- project built from these migrations an evidence insert either fails or is
-- silently dropped by PostgREST. Add a permissive INSERT policy that mirrors
-- the existing SELECT policy: admins may write any row, an active agent may
-- only write evidence for themselves.
--
-- Role resolution uses current_user_role() (email binding first) so a revoked
-- role binding takes effect even when profiles.role still holds the old value.
-- Workspace isolation remains enforced by the restrictive
-- finance_workspace_isolation_guard policy.

drop policy if exists "collection_evidence_insert_guard"
  on public.collection_evidence;

create policy "collection_evidence_insert_guard"
  on public.collection_evidence
  as permissive
  for insert
  to authenticated
  with check (
    public.current_user_role() = 'admin'
    or exists (
      select 1
      from public.agents
      where public.agents.id = collection_evidence.agent_id
        and public.agents.auth_user_id = auth.uid()
        and lower(trim(coalesce(public.agents.status, ''))) = 'active'
    )
  );

grant insert on public.collection_evidence to authenticated;
