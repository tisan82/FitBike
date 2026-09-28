# FitBike Tire, Battery Product and Fitment Policy

**Version:** v1.0  
**Status:** Baseline

이 문서는 FitBike의 타이어·배터리 상품 원장, 판매 연결 및 Model-Year
Fitment 운영 기준의 Service Module Source of Truth다.

전역 서비스 원칙은 `docs/01_product/SERVICE.md`, DB/Fitment 전역 규칙은
`docs/02_framework/DATABASE.md`, API 계약은 `docs/02_framework/API.md`,
정확한 현재 Schema는 `docs/04_database_schema/`를 따른다.

## 1. Scope and ownership

이 문서가 소유하는 범위:

- Tire Model과 Tire SKU 상품 원장
- Battery Product 상품 원장
- 상품 규격, 이미지, 가격, 판매 URL, 판매자 정보
- Tire Model ↔ SKU 관계
- Bike Model-Year ↔ Tire Product Fitment
- Battery Standard ↔ Battery Product 관계
- 신규/수정 상품 및 Model-Year에 대한 자동 매칭 운영
- 상품/Fitment 데이터 QA
- 상품 비활성화와 판매 연결 상태 점검
- SmartStore 등 외부 판매처 연결 데이터

브랜드·모델·모델-연식 identity와 차량 제원 자체는
`MODEL_YEAR_DATA.md`가 소유한다. Brake 상품/Fitment는 현재 DB 전역 정책을
따르며 이 문서의 Tire/Battery 전용 자동 매칭 규칙을 그대로 적용하지 않는다.

## 2. Required reading before work

타이어·배터리 상품/Fitment Task를 시작할 때 현재 `main`에서 다음을 확인한다.

1. `AGENTS.md`
2. `docs/01_product/SERVICE.md`
3. 이 문서 `docs/03_service_modules/PRODUCT_FITMENT.md`
4. `docs/02_framework/DATABASE.md`
5. `docs/02_framework/API.md` — 화면/API 계약이 관련된 경우
6. `docs/03_service_modules/MODEL_YEAR_DATA.md` — Model-Year 변경이 관련된 경우
7. `docs/04_database_schema/` 최신 export
8. 대상 Repository/Service/API/Batch 코드
9. Production Supabase의 실제 상품/Fitment 행

정확한 table/column/constraint/FK/index는 Production과 최신 Schema export로
확정한다. 과거 채팅, Memory, 공급사 파일의 예시 컬럼명을 실제 DB identifier로
추정하지 않는다.

## 3. Current entity boundaries

현재 구조의 의미는 다음과 같다.

- `03_bike_model_year`: 차량 Model + Year와 검증된 차량 규격
- `11_tire_model`: 타이어 공통 모델 identity
- `04_tire_product`: 실제 규격별/판매 가능한 Tire SKU
- `07_bike_model_year_tire_product`: Model-Year ↔ Tire SKU Fitment
- `05_battery_product`: Battery 상품 원장
- `08_battery_standard_product`: 검증된 Battery Standard ↔ Product 관계

Tire Model과 Tire SKU를 혼동하지 않는다. 모델 설명/공통 이미지는 Tire Model
단위가 적합하고, 사이즈·하중·속도·튜브 타입·판매 URL·가격 등 SKU 사실은
Tire Product 단위가 기준이다.

## 4. Product master principles

상품을 등록하거나 수정하기 전에 기존 원장을 먼저 조회한다.

다음만으로 신규 상품을 만들지 않는다.

- 상품명 표기 차이
- 공백/하이픈 차이
- 판매처 제목 차이
- 판매 URL 변경
- 가격 변경

동일 SKU인지 판단할 때 제조사/공급사 identity와 규격을 확인한다.

상품 원장의 미확인 값은 NULL/unknown으로 유지한다. 판매자 상세페이지의
마케팅 문구를 제조사 공식 규격처럼 저장하지 않는다.

## 5. Tire product rules

Tire SKU의 Fitment 판단에 필요한 구조화 값은 공식 또는 검증 가능한 자료를
우선한다.

주요 확인 항목:

- brand/model identity
- width
- ratio
- diameter
- load index
- speed index
- tube type
- product position
- full size notation

`position_type` 의미는 `DATABASE.md`의 Tire Position Policy를 따른다.
`COMMON`은 자동으로 FRONT/REAR 모두 호환된다는 의미가 아니다.

원문 규격 문자열만 있고 구조화 값이 충분히 검증되지 않은 SKU는 자동 Fitment
대상으로 사용하지 않는다.

## 6. Tire fitment rules

Tire SKU Fitment의 실제 관계는
`07_bike_model_year_tire_product`만 사용한다.

타이어 모델명이 같거나 사이즈 문자열이 비슷하다는 이유로 관계를 추정하지
않는다.

운영 자동 매칭은 `DATABASE.md`의 안전 조건을 만족하는 경우에만
`AUTO_SIZE_MATCH`를 생성할 수 있다.

최소 비교 대상:

- 장착 위치
- width
- ratio
- diameter
- 확인 가능한 tube type
- load index
- speed index

상품의 하중/속도 등급이 차량 요구값보다 낮으면 자동 연결하지 않는다.
필요 값이 NULL이거나 해석이 모호하면 자동 연결하지 않고 Review/HOLD로 남긴다.

자동 매칭 규칙을 수정할 때는 신규 대상만 보지 말고 기존 전체 활성 Fitment에
미치는 영향 건수를 먼저 계산한다.

## 7. Battery product rules

Battery Product는 공식/공급사 자료에서 다음을 가능한 범위에서 확인한다.

- spec code
- voltage
- dimensions
- capacity
- CCA 관련 값
- battery type
- terminal polarity/type
- 상품 이미지
- 판매 URL
- 가격

제품 규격 코드가 비슷하거나 외형 치수가 같다는 이유만으로 차량 호환성을
추정하지 않는다.

## 8. Battery fitment rules

차량 측 기준은 `03_bike_model_year.battery_standard_code`이며 상품 연결은
검증된 `08_battery_standard_product` 관계를 사용한다.

자동화는 이미 검증된 표준 코드에서 다음과 같은 표기 정규화만 허용한다.

- 공백
- 구분자
- 대소문자

전압, Ah, 치수, 단자 방향이 비슷하다는 이유로 새로운 표준 호환 관계를
자동 생성하지 않는다.

납산/AGM/MF/리튬 등 배터리 기술 유형이 다를 경우 같은 외형 규격만으로
대체 가능하다고 판단하지 않는다. 제조사 적용표 또는 검증 가능한 공식 호환
근거가 필요하다.

## 9. Commerce data

판매 URL과 가격은 Fitment truth와 분리해서 관리한다.

판매 URL이 변경되거나 상품번호가 갱신되어도 차량 Fitment를 다시 추론하지
않는다. 기존 SKU identity와 판매 상품이 동일한지 먼저 확인한 뒤 commerce
필드만 갱신한다.

SmartStore 등 외부 판매처 상품번호를 연결할 때:

1. 현재 Product/SKU를 정확히 식별한다.
2. 외부 상품명과 규격을 대조한다.
3. 동일 SKU임을 확인한다.
4. 현재 판매 가능한 URL인지 확인한다.
5. DB의 실제 commerce 필드 계약에 맞춰 저장한다.
6. 실제 서비스에서 랜딩을 검증한다.

단순히 숫자가 더 크다는 이유만으로 항상 최신/정상 상품이라고 일반화하지
않는다. 특정 공급사 데이터에서 그런 규칙이 검증된 경우 해당 Batch에서만
근거와 함께 적용한다.

가격 변경은 Fitment 관계를 변경하지 않는다.

## 10. Images

상품 이미지는 실제 Product/Model identity와 일치해야 한다.

- Tire Model 공통 이미지는 `11_tire_model`의 현재 이미지 계약을 따른다.
- SKU 이미지가 다른 규격의 사이드월/표기를 보여 사용자를 오인하게 만들 수
  있으면 공통 이미지로 대체하기 전에 적합성을 검토한다.
- DB에는 현재 Storage 정책에 맞는 object path 또는 계약된 값을 저장한다.
- 외부 이미지 URL을 장기 자산 경로처럼 임의 저장하지 않는다.
- 공식 이미지 사용 권한/출처 정책이 필요한 경우 현재 프로젝트 정책을 확인한다.

## 11. Batch workflow

상품 또는 Fitment 대량 작업은 다음 순서를 기본으로 한다.

1. Production 현재 상품 원장과 관계 수를 조회한다.
2. 입력 자료/공식 자료와 기존 원장을 대조한다.
3. 신규/수정/중복/미확인 대상을 분류한다.
4. 상품 원장을 먼저 정리한다.
5. Tire Model ↔ SKU 또는 Battery Standard ↔ Product 관계를 검증한다.
6. 차량 측 Model-Year 규격의 신뢰 상태를 확인한다.
7. 안전 조건을 만족하는 Fitment만 반영한다.
8. 자동 매칭 대상과 HOLD 대상을 분리한다.
9. 변경 전/후 row count와 중복을 확인한다.
10. 실제 API/상품 상세/구매 랜딩을 QA한다.

Model-Year 신규 등록 Batch와 연계할 경우 해당 Model-Year가 정확히 식별되고
규격이 검증된 뒤 Fitment를 계산한다.

## 12. Classification

대량 작업에서는 가능한 경우 다음 상태를 사용한다.

- `MATCH`: 현재 원장/관계가 근거와 일치
- `ADD_PRODUCT`: 신규 Product/SKU
- `UPDATE_PRODUCT`: 기존 상품 정보 수정
- `LINK_MODEL`: Tire Model ↔ SKU 관계 보강
- `ADD_FITMENT`: 검증된 신규 Fitment
- `UPDATE_COMMERCE`: 가격/판매 URL 등 commerce 정보만 변경
- `DUPLICATE`: 중복 상품 또는 중복 관계
- `CONFLICT`: 공식/검증 자료와 기존 데이터 충돌
- `UNVERIFIED`: 근거 부족
- `HOLD`: 자동 반영 금지, 검토 필요
- `DEACTIVATE`: 판매/서비스 정책상 비활성화 대상

`UNVERIFIED`와 `HOLD`를 자동 매칭으로 해소하지 않는다.

## 13. Pre-mutation quality gates

반영 전 최소 확인 항목:

### Product
- 중복 Product key/SKU
- 동일 SKU의 상충 규격
- active Product의 필수 identity
- Tire Product의 Tire Model 관계
- 판매 URL과 실제 SKU 일치
- 가격/이미지의 대상 Product 일치

### Tire Fitment
- Model-Year active 상태
- Product active 상태
- position 일치
- width/ratio/diameter
- tube type
- load/speed requirement
- 동일 관계 중복
- FRONT/REAR 잘못된 교차 연결

### Battery
- Model-Year의 standard code 검증 상태
- Product spec code/전압/치수/단자 정보
- Standard ↔ Product 관계 중복
- 표기 정규화와 실제 호환성 판단을 혼동하지 않았는지

## 14. Automation guardrails

자동 매칭의 목표는 연결 건수를 최대화하는 것이 아니라 **검증 가능한 안전한
연결을 반복 가능하게 만드는 것**이다.

자동화 변경 전:

1. 현재 규칙을 확인한다.
2. 후보 건수를 계산한다.
3. 신규 연결 예상 건수를 계산한다.
4. 기존 연결 변경/해제 가능성을 계산한다.
5. false-positive 위험 샘플을 확인한다.

변경 후:

1. 신규 관계 수
2. 중복 수
3. HOLD 수
4. 대표 Model-Year 샘플
5. 기존 정상 Fitment 보존
6. 서비스 노출

을 검증한다.

최근 N일 신규/수정 데이터 같은 Batch 범위를 사용할 경우 날짜 기준이
`created_at`인지 `updated_at`인지 Task에서 명확히 정의하고 실제 목적과 맞는지
검증한다.

## 15. Deactivation and deletion

판매 종료, URL 만료, 공급 중단을 이유로 Product/Fitment를 즉시 DELETE하지
않는다.

현재 Schema와 서비스 계약에 맞는 `is_active` 비활성화를 우선 검토한다.

Product 비활성화 전 해당 Product가 참조되는 Fitment와 사용자 화면을 확인한다.
중복 정리 등 DELETE가 필요한 경우 FK와 영향 범위를 확인하고 복구 가능한
방식으로 수행한다.

## 16. Mutation and verification

사용자가 조사/검토만 요청하면 Production을 변경하지 않는다.

실제 반영 요청에서는 exact target을 확인하고 pre/post 값을 비교한다.
Schema/대량 UPDATE/DELETE/자동 매칭 규칙 변경은 영향 범위를 먼저 확인한다.

상품/Fitment 변경 완료는 SQL 성공으로 판단하지 않는다. 최소한 해당 변경과
관련된 다음 사용자 경로를 검증한다.

- Model-Year 상세 → 타이어/배터리 노출
- Tire SKU/Model 상세 → Fitment
- 외부 구매 링크 → 올바른 상품 랜딩

영향 없는 경로는 기계적으로 모두 검사하지 않는다.

## 17. Completion criteria

Batch 완료 조건:

- 대상 상품 원장 Audit 완료
- 중복/충돌 해결 또는 HOLD
- 상품 규격 근거 확인
- Tire Model ↔ SKU 관계 정상
- Battery Standard ↔ Product 관계 정상
- 생성된 Fitment가 현재 정책을 만족
- 기존 정상 Fitment 손상 없음
- 가격/URL/이미지가 올바른 Product에 연결
- DB pre/post 검증 PASS
- 관련 서비스/API/구매 랜딩 QA PASS
- 미확인 대상은 UNVERIFIED/HOLD로 별도 보고

조건을 충족하지 않으면 `완료`라고 표현하지 않고 `부분 완료`,
`차단됨`, `추가 수정 필요`로 구분한다.

## 18. Persistent policy

앞으로 반복 적용해야 하는 상품/Fitment 규칙이 새롭게 확정되면 채팅 Memory에만
두지 않는다.

- Tire/Battery 상품 및 Fitment에 한정된 규칙: 이 문서
- DB 전체에 적용되는 관계/무결성 원칙: `DATABASE.md`
- 공개 API 계약: `API.md`
- Model-Year 자체 정책: `MODEL_YEAR_DATA.md`
- 실제 Schema: `04_database_schema/`

동일 정책을 여러 문서에 복제하지 않는다. 일회성 공급사 파일 해석 규칙이나
특정 상품번호는 장기 정책으로 자동 승격하지 않는다.

## 19. Reporting

### 현재 상태
상품/관계/Fitment 현황과 주요 품질 상태

### Audit 결과
신규/수정/중복/충돌/HOLD 수

### 이번 변경
실제 상품, 관계, commerce, Fitment 변경

### Fitment QA
자동/수동 관계의 검증 결과와 기존 관계 보존 여부

### Production
모델 상세, 상품 상세, 구매 랜딩에서 보이는 결과

### 미완료 / HOLD
근거 부족 또는 충돌 대상

### 다음 작업
남은 상품/브랜드/신규 Model-Year Batch
