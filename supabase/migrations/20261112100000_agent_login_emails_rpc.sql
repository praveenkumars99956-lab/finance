-- Admin helper: expose the real Supabase Auth login email for each agent.
--
-- Why: agent logins are tenant-scoped aliases
-- ("name+<workspacehex>@gmail.com", see functions/_shared/tenantAuthEmail.ts),
-- but public.agents only stores the contact email. The Agents screen therefore
-- cannot tell an admin which email to give the agent. This read-only function
-- returns the auth email and the attached profile role so the UI can show both
-- and flag role/account mismatches (the "does not match the selected Agent
-- login" error).
--
-- Additive and read-only. It never changes agent, profile, or auth data.

create or replace function public.finance_agent_login_emails()
returns table (
  agent_row_id text,
  agent_code text,
  contact_email text,
  login_email text,
  login_role text,
  workspace_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id::text               as agent_row_id,
    a.agent_id::text         as agent_code,
    a.email::text            as contact_email,
    u.email::text            as login_email,
    p.role::text             as login_role,
    a.workspace_id           as workspace_id
  from public.agents a
  left join auth.users u
    on u.id = a.auth_user_id
  left join public.profiles p
    on p.id = a.auth_user_id
  where exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.role = 'admin'
  )
    and coalesce(
      a.workspace_id,
      '00000000-0000-4000-8000-000000000001'::uuid
    ) = public.finance_current_workspace_id()
  order by a.created_at desc;
$$;

revoke all on function public.finance_agent_login_emails() from public, anon;
grant execute on function public.finance_agent_login_emails() to authenticated;

notify pgrst, 'reload schema';
