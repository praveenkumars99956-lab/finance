alter table public.category_agent_assignments
  drop constraint if exists category_agent_assignments_collection_type_check;

alter table public.category_agent_assignments
  add constraint category_agent_assignments_collection_type_check
  check (collection_type in ('all', 'daily', 'weekly', 'monthly', 'interest_only'));