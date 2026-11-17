-- Enable Realtime invalidation for the Collections dashboard.
--
-- This publishes only the tables Collections reads. Supabase Realtime
-- enforces RLS on postgres_changes, so an admin only receives events for
-- rows in their own workspace. The event payload is used purely as an
-- invalidation signal; the browser refetches the canonical data afterwards.
--
-- Safe to re-run: tables are added only when absent from the publication.

do $do$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$do$;

do $do$
declare
  target_table text;
begin
  foreach target_table in array array[
    'finance_records',
    'finance_payments',
    'collection_evidence',
    'category_agent_assignments'
  ] loop
    if to_regclass('public.' || target_table) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = target_table
       )
    then
      execute 'alter publication supabase_realtime add table public.' ||
        quote_ident(target_table);
    end if;
  end loop;
end
$do$;
