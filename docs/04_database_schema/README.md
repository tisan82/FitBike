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

현재 알려진 core table은 10개이며 `10_bike_model_year_image`를 포함한다.
누락된 schema detail을 기억이나 문서로 재구성하지 않는다.
