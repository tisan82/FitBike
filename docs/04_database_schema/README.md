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

2026-09-18 운영 metadata 기준 public table은 총 20개다. Fitment core
`01`~`11`, Content `12`~`17`, Service Shop `20`~`22`를 포함한다.
누락된 schema detail을 기억이나 문서로 재구성하지 않는다.

`public.rls_auto_enable()`은 `service_role`만 실행할 수 있으며,
`public.set_updated_at()`은 `search_path=pg_catalog`으로 고정한다.

## Tire Model Relationship

`04_tire_product.tire_model_id`는 nullable `bigint`이며
`11_tire_model.tire_model_id`를 참조한다. FK constraint는
`04_tire_product_tire_model_id_fkey`이고 `ON UPDATE NO ACTION`,
`ON DELETE NO ACTION`이다. `idx_04_tire_product_tire_model_id` index가
연결 조회를 지원한다.

`11_tire_model`은 RLS가 활성화되어 있다. 공개 SELECT policy는
`Public can read active tire models`이며 `anon`, `authenticated` role에
`is_active = true` 조건으로 적용된다.

## 2026-09-30 Visual staging delta

21_content_pipeline_image의 현재 column/check/index metadata를 Production에서 다시 조회해 동기화했다. staging_asset/staging_input/handoff_phase와 READY_FOR_UPLOAD가 추가됐다. 다른 테이블의 기존 export는 이번 변경으로 최신 전체 export임을 보장하지 않는다. RPC/Storage DDL의 정확한 정의는 이번 네 개 migration을 함께 확인한다.

## 2026-09-30 Source-stage job delta

`27_content_pipeline_source_stage_job` is an additive, service-role-only transport receipt for URL/PDF capability probes and optional real 3-A candidates. Columns/checks/indexes were fetched from Production after the two source-stage migrations. It is not a replacement Content Pipeline or image status table. RLS has no public policy by design. Existing unrelated exports remain unchanged and are not asserted current.

## 2026-10-01 Provenance-only image operations

`17_content_asset_source.rights_status` is nullable with no default. Historical values/check constraints remain; new Publish rows store NULL for rights/license/permission metadata. Source Stage ignores legacy rights/license/permission input and writes provenance only. Existing Claim, image QA, SHA/decode, RLS and ticket guards are unchanged. Migration: `20261001015258_source_provenance_only.sql`.
