-- ============================================================================
-- Finance App - agent login / missing-data diagnostics
--
-- Case: praveenkumarsre35t@gmail.com
--
-- Run in Supabase Dashboard -> SQL Editor. Everything in section 1 is
-- READ-ONLY. Repair statements at the bottom are commented out on purpose.
--
-- Why this matters:
--   Login.jsx only reports "This account does not match the selected Agent
--   login" when Supabase sign-in SUCCEEDED but profiles.role <> 'agent'.
--   A person can have several auth accounts for the same contact email:
--     - legacy account:            name@gmail.com
--     - tenant account:            name+<workspacehex>@gmail.com
--   Only the tenant account that is linked through agents.auth_user_id has
--   role = 'agent'. Signing in with the other one gives that mismatch, and
--   the agent dashboard then has no data because it is a different account.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Every auth account that could belong to this person, with its real role
--    and any agent row linked to it.
--    Read this first: the row with agent_row_id IS NOT NULL is the login that
--    must be used (or the login that must be repaired).
-- ----------------------------------------------------------------------------
with target as (
  select lower('praveenkumarsre35t@gmail.com') as contact_email
)
select
  u.id                                        as auth_user_id,
  u.email                                     as auth_email,
  case
    when lower(u.email) = t.contact_email
      then 'plain contact email'
    when lower(u.email) like replace(t.contact_email, '@', '+%@')
      then 'tenant alias'
    when lower(u.raw_user_meta_data ->> 'contact_email') = t.contact_email
      then 'matched via metadata'
    else 'other'
  end                                         as email_kind,
  u.raw_user_meta_data ->> 'contact_email'    as meta_contact_email,
  u.raw_user_meta_data ->> 'role'             as meta_role,
  u.raw_user_meta_data ->> 'workspace_id'     as meta_workspace_id,
  u.email_confirmed_at,
  u.banned_until,
  u.deleted_at,
  u.created_at,
  u.last_sign_in_at,
  p.role                                      as profile_role,
  length(p.role)                              as profile_role_length,
  p.full_name                                 as profile_full_name,
  p.workspace_id                              as profile_workspace_id,
  a.id                                        as agent_row_id,
  a.agent_id                                  as agent_code,
  a.status                                    as agent_status,
  a.workspace_id                              as agent_workspace_id,
  a.email                                     as agent_contact_email_model
from auth.users u
cross join target t
left join public.profiles p on p.id = u.id
left join public.agents  a on a.auth_user_id = u.id
where lower(u.email) = t.contact_email
   or lower(u.email) like replace(t.contact_email, '@', '+%@')
   or lower(u.raw_user_meta_data ->> 'contact_email') = t.contact_email
order by u.created_at;

-- ----------------------------------------------------------------------------
-- 2. Agents table rows for this contact email, regardless of how their
--    auth_user_id is (or is not) linked.
-- ----------------------------------------------------------------------------
with target as (
  select lower('praveenkumarsre35t@gmail.com') as contact_email
)
select
  a.id                       as agent_row_id,
  a.agent_id                 as agent_code,
  a.full_name,
  a.email                    as agent_contact_email,
  a.status                   as agent_status,
  a.workspace_id             as agent_workspace_id,
  a.auth_user_id,
  u.email                    as linked_auth_email,
  p.role                     as linked_profile_role,
  p.workspace_id             as linked_profile_workspace_id,
  a.created_by,
  a.created_at
from public.agents a
cross join target t
left join auth.users u      on u.id = a.auth_user_id
left join public.profiles p on p.id = a.auth_user_id
where lower(a.email) = t.contact_email
order by a.created_at;

-- ----------------------------------------------------------------------------
-- 3. "Data is missing" check: what the agent can actually see once logged in.
--    Agent visibility = active agent row -> active category assignments ->
--    finance_records in those categories -> customers.
--    If active_assignments = 0, the agent will legitimately see no customers
--    or loans even though the account works.
-- ----------------------------------------------------------------------------
with target as (
  select lower('praveenkumarsre35t@gmail.com') as contact_email
),
agent_rows as (
  select a.*
  from public.agents a
  cross join target t
  where lower(a.email) = t.contact_email
     or a.auth_user_id in (
       select u.id
       from auth.users u
       cross join target t2
       where lower(u.email) = t2.contact_email
          or lower(u.email) like replace(t2.contact_email, '@', '+%@')
          or lower(u.raw_user_meta_data ->> 'contact_email') = t2.contact_email
     )
),
visible_loans as (
  select
    caa.agent_id,
    count(distinct fr.id)          as active_loans,
    count(distinct fr.customer_id) as customers_with_active_loans
  from public.category_agent_assignments caa
  join public.finance_records fr
    on fr.collection_category_id = caa.category_id
   and fr.loan_status = 'active'
  where caa.status = 'active'
  group by caa.agent_id
)
select
  a.id                    as agent_row_id,
  a.agent_id              as agent_code,
  a.status                as agent_status,
  a.workspace_id          as agent_workspace_id,
  count(distinct caa.id)  filter (where caa.status = 'active') as active_assignments,
  count(distinct caa.id)                                       as total_assignments,
  count(distinct caa.category_id) filter (where caa.status = 'active') as active_categories,
  coalesce(max(vl.active_loans), 0)                as active_loans_in_assigned_categories,
  coalesce(max(vl.customers_with_active_loans), 0) as customers_with_active_loans
from agent_rows a
left join public.category_agent_assignments caa on caa.agent_id = a.id
left join visible_loans vl on vl.agent_id = a.id
group by a.id, a.agent_id, a.status, a.workspace_id
order by a.created_at;

-- ----------------------------------------------------------------------------
-- 4. One-line diagnosis.
-- ----------------------------------------------------------------------------
with target as (
  select lower('praveenkumarsre35t@gmail.com') as contact_email
),
matches as (
  select
    u.id,
    u.email,
    lower(trim(coalesce(p.role, ''))) as role
  from auth.users u
  cross join target t
  left join public.profiles p on p.id = u.id
  where lower(u.email) = t.contact_email
     or lower(u.email) like replace(t.contact_email, '@', '+%@')
     or lower(u.raw_user_meta_data ->> 'contact_email') = t.contact_email
),
agent_links as (
  select a.auth_user_id
  from public.agents a
  cross join target t
  where lower(a.email) = t.contact_email
)
select
  case
    when not exists (select 1 from matches)
      then 'A. No auth user found for this email or its tenant alias. The login account must be created or repaired.'

    when exists (
      select 1 from matches m
      join agent_links l on l.auth_user_id = m.id
      where m.role = 'agent'
    )
      then 'B. OK: an auth account with profile role = agent is linked to the agent row. Sign in with THAT email from query 1 (usually the +alias), not the plain contact email.'

    when exists (
      select 1 from matches m
      join agent_links l on l.auth_user_id = m.id
    )
      then 'C. The agent row is linked to an auth account whose profile role is NOT agent. This is the role-mismatch error. Repair profiles.role or relink agents.auth_user_id.'

    when exists (select 1 from matches where role = 'agent')
      then 'D. An agent-role auth account exists, but no agents row is linked to it. Repair agents.auth_user_id or create the agents row.'

    else 'E. Auth accounts exist, but none is role = agent and none is linked to an agent row. Manual repair needed.'
  end as diagnosis;

-- ============================================================================
-- 5. REPAIR TEMPLATES - do not run blindly.
--    Take the IDs from query 1 / query 2, pick ONE case, uncomment and run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- CASE C1: the agent row is linked to an auth user whose profile role is
--          wrong (e.g. the profile says admin/client), and that auth user is
--          the one that should be the agent.
--          WARNING: if this same login must stay an admin, do NOT change it.
--          Create/link a separate agent login instead.
-- ---------------------------------------------------------------------------
-- update public.profiles
--    set role = 'agent',
--        workspace_id = coalesce(
--          (select a.workspace_id from public.agents a
--            where a.auth_user_id = '<AUTH_USER_ID>' limit 1),
--          workspace_id
--        )
--  where id = '<AUTH_USER_ID>';

-- ---------------------------------------------------------------------------
-- CASE C2: the agents row belongs to the right agent but points at the wrong
--          auth user (for example the plain-email admin account is linked by
--          mistake). Point it at the correct tenant-alias auth user instead.
-- ---------------------------------------------------------------------------
-- update public.agents
--    set auth_user_id = '<CORRECT_AUTH_USER_ID>'
--  where id = '<AGENT_ROW_ID>';

-- ---------------------------------------------------------------------------
-- CASE C3: profile is missing for an existing auth user that is already
--          linked from agents.auth_user_id.
-- ---------------------------------------------------------------------------
-- insert into public.profiles (id, full_name, role, workspace_id)
-- select a.auth_user_id,
--        a.full_name,
--        'agent',
--        a.workspace_id
--   from public.agents a
--  where a.id = '<AGENT_ROW_ID>'
-- on conflict (id) do update
--    set role = 'agent',
--        workspace_id = excluded.workspace_id;

-- ---------------------------------------------------------------------------
-- CASE D1: the agent row is missing, but an agent-role auth user exists.
--          (Only if you really want to recreate the agent record.)
-- ---------------------------------------------------------------------------
-- insert into public.agents (
--   agent_id, full_name, phone, email, address, status,
--   auth_user_id, workspace_id, created_by
-- )
-- select
--   'AGT' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
--   p.full_name,
--   null,
--   '<CONTACT_EMAIL>',
--   null,
--   'active',
--   p.id,
--   p.workspace_id,
--   p.id
-- from public.profiles p
-- where p.id = '<AUTH_USER_ID>'
--   and p.role = 'agent';

-- ---------------------------------------------------------------------------
-- CASE E1: no auth user at all. Do this from the Dashboard, not SQL, so the
--          password is hashed and the email identity is created correctly:
--            Authentication -> Users -> Add user
--            email:    praveenkumarsre35t+<workspacehex>@gmail.com
--            password: <temporary password>
--            Auto Confirm User: ON
--          Then link it:
-- update public.agents
--    set auth_user_id = '<NEW_AUTH_USER_ID>'
--  where id = '<AGENT_ROW_ID>';
-- ---------------------------------------------------------------------------

-- ============================================================================
-- 6. Notes
--
-- * The tenant alias formula is:
--     lower(local_part) + '+' + workspace_id with hyphens removed + '@' + domain
--   (see supabase/functions/_shared/tenantAuthEmail.ts). Example for the
--   legacy workspace (00000000-0000-4000-8000-000000000001):
--     praveenkumarsre35t+00000000000040008000000000000001@gmail.com
--
-- * A password reset must be requested for the AUTH email (the +alias), not
--   for the plain contact email. ForgotPassword.jsx sends exactly what is typed.
--
-- * Editing an agent's email in Admin -> Agents only updates public.agents.
--   It does NOT update the Supabase auth login (frontend/src/pages/admin/Agents.jsx).
-- ============================================================================
