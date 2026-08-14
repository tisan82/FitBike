begin;

do $$
begin
  if exists (
    select 1
    from public."04_tire_product"
    where position_type is not null
      and position_type not in ('FRONT', 'REAR', 'COMMON')
  ) then
    raise exception 'Unexpected 04_tire_product.position_type value; migration aborted';
  end if;
end
$$;

alter table public."04_tire_product"
  drop constraint "04_tire_product_position_type_check";

alter table public."04_tire_product"
  add constraint "04_tire_product_position_type_check"
  check (
    position_type is null
    or position_type = any (
      array[
        'FRONT'::text,
        'REAR'::text,
        'BOTH'::text,
        'COMMON'::text
      ]
    )
  );

commit;
