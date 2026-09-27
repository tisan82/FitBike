do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('private.run_fitment_link_batch(timestamptz)'::regprocedure)
  into v_definition;

  v_updated := replace(
    v_definition,
    '      and (y.created_at >= p_since or y.updated_at >= p_since)' || chr(10) ||
    '      and nullif(trim(y.battery_standard_code), '''') is not null',
    '      and y.updated_at >= p_since' || chr(10) ||
    '      and nullif(trim(y.battery_standard_code), '''') is not null'
  );

  v_updated := replace(
    v_updated,
    '    and (y.created_at >= p_since or y.updated_at >= p_since)' || chr(10) ||
    '    and nullif(trim(y.battery_standard_code), '''') is not null',
    '    and y.updated_at >= p_since' || chr(10) ||
    '    and nullif(trim(y.battery_standard_code), '''') is not null'
  );

  if v_updated = v_definition then
    raise exception 'battery updated_at predicate replacement did not match';
  end if;

  if position('(y.created_at >= p_since or y.updated_at >= p_since)' || chr(10) ||
              '      and nullif(trim(y.battery_standard_code)' in v_updated) > 0
     or position('(y.created_at >= p_since or y.updated_at >= p_since)' || chr(10) ||
              '    and nullif(trim(y.battery_standard_code)' in v_updated) > 0 then
    raise exception 'legacy battery target predicate remains';
  end if;

  execute v_updated;
end;
$migration$;

comment on function private.run_fitment_link_batch(timestamptz) is
'Links tire products for newly created or updated model-years; battery aliases are evaluated only for model-years updated since p_since.';
