insert into public.collection_categories (category_name, status)
select 'Interest-Only Collection', 'active'
where not exists (
  select 1
  from public.collection_categories
  where lower(trim(category_name)) = lower('Interest-Only Collection')
);