# Service Module --- Product Connection

**Version:** v1.0\
**Status:** Baseline

Fitment/specification과 상품을 명시적 DB 관계로 연결한다. 명시적 정책
없이 상품 랭킹/추천을 만들지 않는다. 상품 연결이 없으면 Empty 상태로
처리하며 대체 상품을 임의 추정하지 않는다. 외부 상품 URL은 Commerce
Gateway이며 FitBike 내부 결제 계약을 의미하지 않는다.

## Tire Model and SKU Detail Contract

`11_tire_model` is the shared tire-model identity and `04_tire_product` is the
sellable SKU. A tire product belongs to its model through
`04_tire_product.tire_model_id`; model-detail presentation must not infer a
model by parsing `product_name` or `tire_product_key`.

The public detail routes are:

- SKU Detail: `/tire-detail/[tireProductId]`
- Tire Model Detail: `/tire-detail/model/[tireModelKey]`
- MAXXIS Tire Model Directory: `/tire-models/maxxis`

Model Detail resolves an active `11_tire_model` by `tire_model_key` and lists
all active `04_tire_product` rows with the resolved `tire_model_id`. Inactive
models and inactive SKUs are not public detail content. The existing SKU Detail
route remains unchanged.

The MAXXIS directory resolves active `11_tire_model` rows with
`brand_name = '맥시스'`, orders them by `model_name` ascending, and links each
card to Tire Model Detail. Category/riding filters may use only stored,
verified values; when those values are NULL the directory remains an unfiltered
model list. It does not rank or recommend models.

### SKU Fitment Disclosure

SKU fitment uses the existing `07_bike_model_year_tire_product` relationship.
Do not create a tire-model fitment table or infer fitment from tire size,
position, product name, or another SKU.

SKU Detail resolves Fitment in reverse from the selected `04_tire_product`
through active mappings to active Bike Model + Year rows. Tire Model Detail may
aggregate those same explicit mappings across its active SKUs; it groups by
`bike_model_year_id` while preserving distinct mapping position, stored tire
size, and Tire Product identity. Neither route may infer Fitment from size or
model identity. When many mappings exist, show only an initial subset and
disclose the full deduplicated set on demand.

Tire Model Detail selects one active SKU at a time, shows its stored
specification, and filters compatible bikes by that `tire_product_id`.
Changing the SKU resets search, brand filter, and expansion state. A SKU with
zero mappings remains selectable and shows a concise registered-fitment empty
message; it is not removed from the model.

### Tire Specification Guide

Tire-size notation guidance is shared presentation knowledge, not tire-model
content, and must not be stored in `11_tire_model`. Maintain it as a reusable
component or common typed data. The guide is collapsed by default under
`타이어 규격 보는 법`.

When a notation contains the relevant token, the guide may explain:

- `120`: 타이어 폭(mm)
- `70`: 편평비(%)
- `ZR`: 타이어 구조/속도 특성
- `17`: 림 직경(inch)
- `58`: 하중지수
- `W`: 속도등급
- `TL`: 튜브리스

The guide explains notation only; it must not manufacture a missing SKU value
or claim a token that is absent from the stored specification.

### Model-to-SKU Selection

Model Detail groups active SKUs by `position_type` and shows only the available
selection information: `tire_size_full`, customer-facing position, and price.
Selecting a row navigates to `/tire-detail/[tireProductId]`. SKU Detail owns the
full specification, fitment, external purchase CTA, model link, and navigation
to other active SKUs in the same model. Missing values do not create empty
labels or placeholders.

Raw DB position codes are not customer-facing copy. A `NULL` position does not
produce a position label. The customer-facing labels are governed by the Tire
Position Contract below.

### Tire Model Image Content Operations

Model image production follows distinct content slots without adding a DB enum.
`main_image_url` prioritizes an accurate real product image prepared at
1200x1200. `sub_image_url_1` is a Product/Feature visual and
`sub_image_url_2` is a Riding/Usage visual, each prepared at 1200x900. Prefer
WebP for production delivery.

Generated imagery must not invent a brand/model logo, tire construction,
compound, tread technology, performance claim, or another technical fact. Do
not use a generated visual when customers could reasonably mistake it for an
actual product characteristic. Production Storage upload remains a separately
approved operation.

Detailed canvas, content, generation, expansion, and QA rules are governed by
`TIRE_MODEL_IMAGE_STANDARD.md`.

In the public Model Detail UI, HTML owns product copy, features, and SKU-derived
attributes. Existing text-composited `sub_image_url_1` assets remain stored but
are hidden to avoid duplicate, inaccessible mobile copy. `sub_image_url_2`
remains the Riding/Usage visual.

## Tire Position Contract

`04_tire_product.position_type`은 상품의 공식 사용 가능 위치이며
`FRONT`, `REAR`, `BOTH`, `COMMON` 또는 `NULL`을 사용한다. `COMMON`은
Legacy 또는 Position 미검증 상태이고, `UNKNOWN`은 Review workflow
전용이므로 Product DB에 저장하지 않는다.

`07_bike_model_year_tire_product.position_type`은 특정 Model-Year 장착
위치이며 `FRONT` 또는 `REAR`만 사용한다. Product Position과 Mapping
Position은 다음 규칙으로 연결한다.

-   Product `FRONT`는 Mapping `FRONT` 후보만 가능하다.
-   Product `REAR`는 Mapping `REAR` 후보만 가능하다.
-   Product `BOTH`는 Mapping `FRONT` 또는 `REAR` 후보가 될 수 있다.
-   Product `COMMON`은 자동 Mapping하지 않고 Position 검증이 필요하다.

Customer-facing Tire Product Detail은 Position DB code를 그대로 노출하지
않고 `FRONT`는 `앞 타이어`, `REAR`는 `뒤 타이어`, `BOTH`는
`앞/뒤 공용`, `COMMON`은 `공용`으로 표시한다.
