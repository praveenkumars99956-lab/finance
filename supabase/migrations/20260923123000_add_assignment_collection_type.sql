alter table public.category_agent_assignments
  add column if not exists collection_type text;

alter table public.category_agent_assignments
  add constraint category_agent_assignments_collection_type_check
  check (
    collection_type is null
    or collection_type in ('daily', 'weekly', 'monthly')
  );

create index if not exists category_agent_assignments_type_idx
  on public.category_agent_assignments (agent_id, collection_type, status);
