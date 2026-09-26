-- COMMON scooter SKUs do not declare a product-level axle. The mapping axle is
-- derived from the verified Model-Year specification, so they are eligible
-- only when the same tube/load/speed safety checks pass.
do $block$
declare
  v_function_definition text;
  v_old_condition constant text :=
    'and (p.position_type = rp.position_type or p.position_type = ''BOTH'')';
  v_new_condition constant text :=
    'and (p.position_type = rp.position_type or p.position_type in (''BOTH'', ''COMMON''))';
begin
  select pg_catalog.pg_get_functiondef(
    'private.run_fitment_link_batch(timestamptz)'::regprocedure
  )
  into v_function_definition;

  if pg_catalog.strpos(v_function_definition, v_old_condition) = 0 then
    raise exception 'Expected product-position condition was not found in private.run_fitment_link_batch';
  end if;

  execute pg_catalog.replace(v_function_definition, v_old_condition, v_new_condition);
end;
$block$;

revoke all on function private.run_fitment_link_batch(timestamptz)
from public, anon, authenticated;
