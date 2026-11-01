-- Collection type is part of assignment identity. The legacy index prevented
-- assigning multiple collection types for the same agent and category.
alter table public.category_agent_assignments
  drop constraint if exists category_agent_assignments_category_id_agent_id_key;
