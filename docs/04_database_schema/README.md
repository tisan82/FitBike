# Current Supabase Schema --- Source of Truth

이 폴더에는 **실제 최신 Supabase schema export**를 둔다.

Expected:

``` text
01_tables.csv
02_columns.csv
03_constraints.csv
04_indexes.csv
05_foreign_keys.csv
06_check_constraints.csv
07_triggers.csv
```

정확한 table/column/type/constraint/index/FK/check/trigger는 이 export가
prose 문서보다 우선한다.

현재 core table은 11개이며 `10_bike_model_year_image`와
`11_tire_model`을 포함한다.
누락된 schema detail을 기억이나 문서로 재구성하지 않는다.

## Tire Model Relationship

`04_tire_product.tire_model_id`는 nullable `bigint`이며
`11_tire_model.tire_model_id`를 참조한다. FK constraint는
`04_tire_product_tire_model_id_fkey`이고 `ON UPDATE NO ACTION`,
`ON DELETE NO ACTION`이다. `idx_04_tire_product_tire_model_id` index가
연결 조회를 지원한다.

`11_tire_model`은 RLS가 활성화되어 있다. 공개 SELECT policy는
`Public can read active tire models`이며 `anon`, `authenticated` role에
`is_active = true` 조건으로 적용된다.
