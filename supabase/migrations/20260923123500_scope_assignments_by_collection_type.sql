alter table public.category_agent_assignments
  drop constraint if exists category_agent_assignments_collection_type_check;

update public.category_agent_assignments
set collection_type = 'all'
where collection_type is null;

alter table public.category_agent_assignments
  alter column collection_type set default 'all',
  alter column collection_type set not null;

alter table public.category_agent_assignments
  add constraint category_agent_assignments_collection_type_check
  check (collection_type in ('all', 'daily', 'weekly', 'monthly'));

do $$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'category_agent_assignments'
    and con.contype = 'u'
    and (
      select array_agg(att.attname order by cols.ordinality)
      from unnest(con.conkey) with ordinality as cols(attnum, ordinality)
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = cols.attnum
    ) = array['agent_id', 'category_id']::name[];

  if constraint_name is not null then
    execute format(
      'alter table public.category_agent_assignments drop constraint %I',
      constraint_name
    );
  end if;
end $$;

create unique index if not exists category_agent_assignments_agent_category_type_key
  on public.category_agent_assignments (agent_id, category_id, collection_type);
