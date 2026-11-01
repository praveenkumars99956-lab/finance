do $$
declare
  function_signature regprocedure;
  definition text;
  cleaned_definition text;
begin
  foreach function_signature in array array[
    'public.generate_daily_schedule(bigint)'::regprocedure,
    'public.generate_weekly_schedule(bigint)'::regprocedure,
    'public.generate_monthly_schedule(bigint)'::regprocedure
  ] loop
    select pg_get_functiondef(function_signature)
    into definition;

    cleaned_definition := replace(definition, 'v_i integer;', '');

    if cleaned_definition = definition then
      raise exception 'Expected redundant loop variable was not found in %', function_signature;
    end if;

    execute cleaned_definition;
  end loop;

  function_signature := 'public.adjust_interest_only_principal(bigint,date,text,numeric,text)'::regprocedure;
  select pg_get_functiondef(function_signature)
  into definition;

  cleaned_definition := replace(definition, 'balance_before numeric;', '');
  cleaned_definition := replace(
    cleaned_definition,
    'balance_before := principal_before + interest_due_after;',
    ''
  );

  if cleaned_definition = definition then
    raise exception 'Expected unused balance_before variable was not found';
  end if;

  execute cleaned_definition;
end;
$$;