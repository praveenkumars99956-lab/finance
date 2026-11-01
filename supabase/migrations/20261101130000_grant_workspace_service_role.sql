-- The admin-workspace Edge Function uses the service role to create workspace
-- rows. RLS bypass does not replace the table-level SQL privileges.
revoke all on table public.workspaces from public, anon, authenticated;

grant select on table public.workspaces to authenticated;
grant all on table public.workspaces to service_role;
