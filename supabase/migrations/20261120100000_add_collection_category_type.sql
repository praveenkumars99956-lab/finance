-- ============================================================================
-- Collection category type
-- ----------------------------------------------------------------------------
-- Adds the loan product a collection category belongs to so admins can tag
-- categories as Daily, Weekly, Monthly or Interest. Existing categories are
-- backfilled from their names before the column is made required.
-- ============================================================================

alter table public.collection_categories
  add column if not exists category_type text;

update public.collection_categories
set category_type = case
  when category_name ilike '%interest%' then 'interest'
  when category_name ilike '%weekly%' then 'weekly'
  when category_name ilike '%monthly%' then 'monthly'
  else 'daily'
end
where category_type is null;

alter table public.collection_categories
  alter column category_type set default 'daily',
  alter column category_type set not null;

alter table public.collection_categories
  drop constraint if exists collection_categories_category_type_check;

alter table public.collection_categories
  add constraint collection_categories_category_type_check
  check (category_type in ('daily', 'weekly', 'monthly', 'interest'));

comment on column public.collection_categories.category_type is
  'Loan product this collection category is intended for: daily, weekly, monthly or interest.';
