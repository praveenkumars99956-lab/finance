-- ============================================================
-- Audit log read access
--
-- security_audit_logs had RLS policies allowing admins to SELECT,
-- but the `authenticated` role was never granted table-level SELECT
-- (only INSERT). PostgREST therefore returned
--   403 "permission denied for table security_audit_logs"
-- for the admin Audit Logs page.
--
-- RLS still limits rows to admins (policy "Admins can view audit
-- logs") and to the caller's workspace, so this grant does not
-- widen who can read the data.
-- ============================================================

grant select on table public.security_audit_logs to authenticated;
