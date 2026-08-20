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
