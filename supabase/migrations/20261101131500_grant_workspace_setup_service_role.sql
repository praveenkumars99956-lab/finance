-- The public workspace-creation Edge Function initializes a profile and
-- default settings using the service role. RLS bypass does not grant SQL table
-- or identity-sequence privileges.
grant all on table public.profiles to service_role;
grant all on table public.app_settings to service_role;

do $$
declare
  settings_id_sequence text;
begin
  settings_id_sequence :=
    pg_get_serial_sequence('public.app_settings', 'id');

  if settings_id_sequence is not null then
    execute format(
      'grant usage, select on sequence %s to service_role',
      settings_id_sequence
    );
  end if;
end;
$$;
