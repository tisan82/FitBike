# Service Module --- Product Connection

**Version:** v1.0\
**Status:** Baseline

Fitment/specification과 상품을 명시적 DB 관계로 연결한다. 명시적 정책
없이 상품 랭킹/추천을 만들지 않는다. 상품 연결이 없으면 Empty 상태로
처리하며 대체 상품을 임의 추정하지 않는다. 외부 상품 URL은 Commerce
Gateway이며 FitBike 내부 결제 계약을 의미하지 않는다.

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
