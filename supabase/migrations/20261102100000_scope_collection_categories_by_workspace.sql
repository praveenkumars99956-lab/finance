do $$
declare
  unique_constraint record;
  unique_index record;
begin
  for unique_constraint in
    select constraint_row.conname
    from pg_constraint constraint_row
    join pg_attribute category_name_column
      on category_name_column.attrelid = constraint_row.conrelid
     and category_name_column.attnum = constraint_row.conkey[1]
    where constraint_row.conrelid = 'public.collection_categories'::regclass
      and constraint_row.contype = 'u'
      and array_length(constraint_row.conkey, 1) = 1
      and category_name_column.attname = 'category_name'
  loop
    execute format(
      'alter table public.collection_categories drop constraint %I',
      unique_constraint.conname
    );
  end loop;

  for unique_index in
    select index_row.indexrelid::regclass as index_name
    from pg_index index_row
    where index_row.indrelid = 'public.collection_categories'::regclass
      and index_row.indisunique
      and not index_row.indisprimary
      and index_row.indnkeyatts = 1
      and (
        select array_agg(category_name_column.attname order by key_column.ordinality)
        from unnest(index_row.indkey) with ordinality as key_column(attnum, ordinality)
        join pg_attribute category_name_column
          on category_name_column.attrelid = index_row.indrelid
         and category_name_column.attnum = key_column.attnum
        where key_column.ordinality <= index_row.indnkeyatts
      ) = array['category_name']::name[]
      and not exists (
        select 1
        from pg_constraint constraint_row
        where constraint_row.conindid = index_row.indexrelid
      )
  loop
    execute format(
      'drop index %s',
      unique_index.index_name
    );
  end loop;
end;
$$;

create unique index if not exists collection_categories_workspace_name_key
  on public.collection_categories (
    coalesce(
      workspace_id,
      '00000000-0000-4000-8000-000000000001'::uuid
    ),
    lower(trim(category_name))
  );
