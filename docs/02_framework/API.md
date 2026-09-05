# FitBike API Guide

**Version:** v1.1\
**Status:** Baseline

## Principles

Service Module Driven / Contract First / Stable Response / Minimal
Exposure.

Public API baseline은 `/api/v1`.

## Tire Detail Route Policy

Customer-facing tire detail routes distinguish a sellable SKU from its shared
model identity.

- SKU Detail: `/tire-detail/[tireProductId]`
- Tire Model Detail: `/tire-detail/model/[tireModelKey]`

The SKU route remains keyed by `04_tire_product.tire_product_id`. The model
route is keyed by `11_tire_model.tire_model_key`; it resolves the model first
and then loads active `04_tire_product` rows through `tire_model_id`. Adding the
model route must not rename, remove, or redirect the existing SKU route.

These are page-route contracts. A new public `/api/v1` endpoint is not implied
by this policy and must be documented separately if one is introduced.

Tire Model Detail resolves active SKUs only as navigation choices. SKU fitment
availability and full specification belong to SKU Detail and must not be
substituted with size-based inference.

`GET /api/v1/tire-products/[tireProductId]` may include additive model linkage,
active fitment count, and other active SKUs for the same `tire_model_id` so the
SKU Detail can provide model navigation and progressive Fitment disclosure.

`GET /api/v1/tire-products/[tireProductId]/fitments` supports that deferred
disclosure. It accepts a positive active Tire Product ID and returns only
active, explicitly mapped Bike Model + Year rows with their mapping position.
It does not perform size-based matching or return inferred fitment.

`GET /api/v1/tire-models/[tireModelKey]/fitments` aggregates only active,
explicit SKU mappings for an active Tire Model. It groups rows by
`bike_model_year_id` and preserves distinct mapping position, stored
`tire_size_full`, and Tire Product identity within each Bike Model-Year. It
does not infer compatibility from size or model identity. The optional positive
`tireProductId` query parameter limits the response to an active SKU belonging
to that Tire Model; omitting it preserves the model-wide response.

## MVP Scope

브랜드, 모델, 연식, Fitment 결과, 상품 연결, 콘텐츠 조회.

## Contract

기존 endpoint/method/response field/type/필수 parameter를 임의 변경하지
않는다. Breaking Change는 승인 필요. 소비 화면에 필요한 필드만 노출한다.
Page component에 API/data business logic을 직접 작성하지 않는다.

## Security

`SUPABASE_SERVICE_ROLE_KEY`를 client에서 사용하지 않는다.
RLS/public-data boundary를 준수한다.

API를 의도적으로 변경하면 관련 API/Service Module 문서를 함께 갱신한다.

## Internal Content Factory API

`/api/internal/content-factory/**`는 공개 API가 아니다. 모든 요청은 서버 전용
`CONTENT_FACTORY_PUBLISH_TOKEN`의 Bearer 인증을 요구하며 응답은 캐시하지 않는다.
Supabase secret/service-role key는 FitBike 서버에만 두고 Factory에는 전달하지 않는다.

| Method | Route | Scope |
|---|---|---|
| `GET` | `/api/internal/content-factory/queue/next` | 다음 `PLANNED` Topic의 콘텐츠 제작 필드만 조회 |
| `PATCH` | `/api/internal/content-factory/queue/{topicKey}` | 허용된 Queue 상태 전환과 제한된 오류 기록 |
| `POST` | `/api/internal/content-factory/assets` | 서버가 결정한 `content-assets/contents/{contentKey}/{assetKey}.webp` 경로에 WebP 업로드 |
| `POST` | `/api/internal/content-factory/publish` | 승인 Topic에 신규 콘텐츠·관계·출처를 원자적으로 게시하고 Queue를 `PUBLISHED`로 전환 |

이 API는 회원 데이터, 사용자 인증 데이터, Fitment 원본 레코드, 임의 SQL,
임의 Storage bucket/path, 콘텐츠 수정·삭제를 제공하지 않는다. Bike/Year relation은
숫자 ID만 입력받아 FK로 존재 여부를 확인하며 원본 엔티티를 응답하지 않는다.

게시 DB 변경은 `service_role`에만 실행 권한을 부여한 제한 RPC를 통한다. RPC는
Topic 상태와 콘텐츠 유형, 이미지 경로, 출처 권리 상태를 재검증하며 하나의 DB
트랜잭션에서 콘텐츠·관계·출처·Queue를 함께 반영한다.

활성화는 migration 검토·적용, FitBike 서버의 `CONTENT_FACTORY_PUBLISH_TOKEN` 및
`SUPABASE_SECRET_KEY` 설정, Preview 통합 검증, 별도 Production 배포 순으로 진행한다.
토큰은 Git 파일이나 일반 GitHub 변수에 기록하지 않고 배포 환경 Secret으로만 둔다.

2026-09-05 read-only 점검에서 운영 DB의 `17_content_asset_source`와
`16_content_topic` editorial 컬럼이 `docs/04_database_schema` export 및 저장소 migration
history보다 앞서 있는 Documentation Drift를 확인했다. 운영 적용 전 schema snapshot을
별도로 동기화해야 한다.
