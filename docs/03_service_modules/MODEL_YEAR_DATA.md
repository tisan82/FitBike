# FitBike Model and Model-Year Data Policy

**Version:** v1.0  
**Status:** Baseline

이 문서는 FitBike의 브랜드·모델·모델-연식 데이터 조사, Audit, 보강 및
Production 반영 기준의 Source of Truth다.

서비스의 전역 원칙은 `docs/01_product/SERVICE.md`, DB 전역 규칙은
`docs/02_framework/DATABASE.md`, 정확한 현재 Schema는
`docs/04_database_schema/`를 따른다. 이 문서는 그 원칙을 모델·연식
데이터 업무에 적용하는 방법만 정의한다.

## 1. Scope and ownership

이 문서가 소유하는 범위:

- 브랜드 단위 모델 목록 Audit
- 한국 시장 모델 및 모델-연식 범위 확인
- `02_bike_model`, `03_bike_model_year`의 모델/연식 정보 품질
- 모델 설명, 엔진/성능/차체 제원, 국내 가격, 엔진오일 정보
- 모델·연식 이미지의 데이터 적합성 확인
- 모델 alias와 공식 reference가 현재 Schema에 존재하는 경우 그 운영 기준
- 모델·연식 데이터와 기존 Tire/Battery/Brake Fitment 간 충돌 탐지

상품 원장과 Fitment 관계 자체의 정책은 `DATABASE.md` 및 해당 상품/Fitment
업무가 소유한다. 모델·연식 Audit 중 Fitment 이상을 발견해도 규격 유사성만으로
호환 관계를 새로 만들지 않는다.

## 2. Required reading before data work

모델·연식 데이터 Task를 시작할 때 다음 순서로 현재 `main`을 확인한다.

1. `AGENTS.md`
2. `docs/01_product/SERVICE.md`
3. 이 문서 `docs/03_service_modules/MODEL_YEAR_DATA.md`
4. `docs/02_framework/DATABASE.md`
5. `docs/04_database_schema/`의 현재 export
6. 대상 테이블을 사용하는 현재 Repository/Service/API 코드
7. Production Supabase의 대상 브랜드/모델/연식 실제 행

Schema 이름, 컬럼, constraint, relation은 기억이나 이 문서의 예시가 아니라
현재 Production과 최신 Schema export로 확정한다.

## 3. Source hierarchy for motorcycle facts

조사는 다음 우선순위를 사용한다.

1. 한국 공식 제조사/수입사 모델 페이지, 가격표, 카탈로그, 사용자 설명서
2. 해당 제조사의 Global/Japan/지역 공식 자료
3. 공식 부품 카탈로그 또는 공식 기술문서
4. 신뢰 가능한 보조 자료

해외 공식 자료는 한국 자료가 부족할 때 보조적으로 사용한다. 해외 자료를
사용하기 전 모델명만 같다는 이유로 동일 차량으로 보지 말고 연식, 세대,
배기량, 형식/프레임 코드, 엔진 또는 주요 부품 identity를 가능한 범위에서
대조한다.

커뮤니티, 판매자 설명, 검색 snippet만으로 핵심 제원이나 Fitment를 확정하지
않는다.

## 4. Korea-first rules

- 국내 판매/유통된 모델과 국내 사양을 우선한다.
- 가격은 한국 공식 판매가만 저장한다. 해외 가격 환산값을 만들지 않는다.
- 단일 공식 가격은 최소/최대 가격이 같은 값으로 표현할 수 있다.
- 트림/공식 옵션에 따른 국내 가격 범위가 확인되면 최소/최대로 관리한다.
- 국내 정보가 없다는 이유로 해외 사양을 국내 사양인 것처럼 표시하지 않는다.

## 5. Model and model-year identity

`02_bike_model`은 모델 identity, `03_bike_model_year`은 서비스의
Model + Model Year 축을 담당한다.

별도 Generation entity를 기본 전제로 만들지 않는다. 현재
`03_bike_model_year`의 연식 구간이 세대/변경 구간을 표현하며,
`generation_name`은 공식 근거가 있을 때만 선택적으로 사용한다.

연식 범위를 나누거나 합칠 때는 최소한 다음 신호를 확인한다.

- 국내 판매 연식
- 큰 배기량 변화
- 엔진/차체 또는 주요 제원의 실질적 변경
- 형식/프레임 코드 변경
- 공식 세대 또는 모델 변경
- 타이어·배터리·브레이크 등 Fitment에 영향을 주는 변경

단순 연도 차이만으로 불필요하게 레코드를 분리하지 않는다.

## 6. Normalization

### Displacement

서비스용 배기량은 정수 cc로 관리한다. 공식값이 소수인 경우 반올림하여
서비스 값을 저장한다.

예: `124.4cc → 124cc`, `124.7cc → 125cc`.

근접한 소수 차이를 이유로 정밀 배기량용 중복 컬럼을 만들지 않는다.
기존 데이터와 큰 배기량 차이가 발견되면 값을 덮어쓰기 전에 모델/연식
identity 변경 신호로 보고 조사한다.

### Missing values

확인되지 않은 값은 `NULL`/unknown으로 유지한다. 같은 모델의 다른 연식,
해외 사양, 유사 모델의 값을 복사하여 빈 칸을 채우지 않는다.

## 7. Enrichment fields

정확한 컬럼 존재 여부와 타입은 항상 최신 Schema에서 확인한다. 현재 Schema가
지원하는 경우 다음 정보를 공식 근거가 확보된 범위에서 보강한다.

- 모델 요약/특징
- 엔진 형식, 냉각 방식, 연료 공급, 변속 방식
- 최고출력/회전수
- 최대토크/회전수
- 전장/전폭/전고/축간거리/시트고
- 중량/연료탱크
- 국내 가격 범위
- 엔진오일 교환량/필터 교환 시 용량/전체 용량
- SAE/API/JASO 등 공식 엔진오일 규격
- 형식/프레임 코드
- 공식 이미지
- 공식 reference

엔진오일 용량과 규격은 Owner's Manual 또는 동등한 공식 기술자료를 우선한다.
세대가 다르면 같은 모델명이라는 이유로 엔진오일 값을 복사하지 않는다.

다음 정보는 모델·연식 데이터 보강의 기본 대상이 아니다.

- 면허/보험 안내
- 판매 계획량
- 임의 정비주기
- 해외 판매 가격
- 추천/랭킹
- 근거 없는 성능 평가

## 8. Brand batch audit

가능한 경우 개별 모델을 연속 처리하지 않고 **브랜드 전체를 하나의 Audit
Batch**로 처리한다.

순서:

1. Production에서 대상 브랜드의 활성 모델과 모든 활성 연식 범위를 추출한다.
2. 한국 공식 라인업/과거 자료와 비교하여 누락 모델과 누락 연식을 찾는다.
3. 동일/중복/충돌/의심 데이터를 분류한다.
4. 기존 오류와 중복을 먼저 정리한다.
5. 누락 모델/연식을 추가한다.
6. 검증 가능한 제원과 설명을 보강한다.
7. 이미지, alias, reference를 점검한다.
8. 기존 Tire/Battery/Brake 데이터와 충돌 여부를 확인한다.
9. 변경 후 DB integrity와 실제 서비스/API를 검증한다.
10. 브랜드 전체 완료 기준을 충족한 뒤 다음 브랜드로 이동한다.

하나의 모델에 자료가 부족하다고 전체 Batch를 중단하지 않는다. 해당 대상을
`UNVERIFIED` 또는 `HOLD`로 격리하고 나머지를 계속 처리한다.

## 9. Audit classification

변경 전에 대상별 판단을 남긴다.

- `MATCH`: 현재 데이터가 근거와 일치
- `ADD_MODEL`: 한국 시장 기준 누락 모델
- `ADD_YEAR`: 기존 모델의 누락 연식/연식 범위
- `UPDATE_YEAR`: 기존 연식 범위 또는 연식 정보 수정
- `SPLIT_YEAR`: 하나의 범위를 근거에 따라 분리
- `MERGE`: 불필요하게 나뉜 범위를 통합
- `DUPLICATE`: 동일 identity의 중복 레코드
- `CONFLICT`: 신뢰 가능한 자료 간 충돌
- `UNVERIFIED`: 충분한 근거 없음
- `NOT_AVAILABLE`: 확인 가능한 공식 정보 없음
- `EXCLUDE`: FitBike 제공 대상이 아님

`CONFLICT`, `UNVERIFIED`는 임의 추론으로 해결하지 않는다.

## 10. Pre-mutation quality gates

대량 반영 전에 최소한 다음을 검사한다.

- 동일 model + 동일 year range 중복
- 같은 모델 내 비의도적 year range overlap
- `start_year > end_year`
- 근거 없이 여러 open-ended range 존재
- 비활성 Brand/Model을 참조하는 활성 데이터
- market/trim/variant 혼동
- 배기량의 큰 불연속
- 변경하려는 연식에 기존 Fitment가 연결되어 있는지
- 이미지가 다른 연식/시장 차량을 오인하게 하지 않는지

중복/overlap을 발견한 상태에서 신규 데이터를 계속 누적하지 않는다. 기존
정합성 문제를 먼저 해결하거나 명시적으로 HOLD한다.

## 11. Mutation rules

Production 데이터 변경은 exact target을 확인하고 pre/post 값을 검증한다.

권장 반영 순서:

1. 명백한 오류
2. 중복/충돌 정리
3. 누락 모델
4. 누락 연식
5. 연식 범위
6. 설명/엔진/차체 제원
7. 국내 가격
8. 엔진오일
9. 이미지/alias/reference
10. 관련 데이터 정합성 재검사

대량 UPDATE/DELETE, Schema 변경, 자동 매칭 규칙 변경은 영향 범위를 먼저
확인한다. 사용자가 단순 조사/검토를 요청한 경우 Production을 변경하지 않는다.

## 12. Fitment boundary

모델·연식 데이터 변경 후 Tire/Battery/Brake 연결의 손상 여부를 확인한다.

- 연식 range 변경으로 기존 mapping 대상이 달라지지 않았는지 확인한다.
- 동일 규격이라는 이유로 새 Fitment를 추정하지 않는다.
- Battery는 검증된 standard code 관계를 따른다.
- Tire는 구조화 규격과 기존 Fitment 정책을 따른다.
- Fitment 정책 자체를 바꿔야 하면 해당 업무 범위로 분리하고 영향도를 확인한다.

## 13. Reference and provenance

현재 Schema에 공식 reference entity가 존재하면 모델/연식 핵심 정보의
근거를 연결한다. 최소한 출처 유형, 제목, publisher, market, URL,
검증 상태를 현재 Schema 계약에 맞춰 기록한다.

reference가 있다는 이유만으로 해당 자료의 모든 값을 자동 승인하지 않는다.
자료가 실제 대상 연식/시장/사양과 일치하는지 검증한다.

## 14. Completion criteria

브랜드 Audit은 단순히 UPDATE/INSERT가 성공했다고 완료하지 않는다.

완료 조건:

- 모델 목록 Audit 완료
- 연식 범위 Audit 완료
- 중복/비의도적 overlap 해결 또는 명시적 HOLD
- 변경값의 근거 확인
- 모델 공통 정보와 연식별 정보가 잘못 섞이지 않음
- 기존 Fitment 관계 손상 없음
- 이미지/alias/reference의 해당 범위 점검
- 변경 후 Production DB 재조회 PASS
- 사용자에게 노출되는 모델 상세/API가 변경 범위에서 정상
- 미확인 대상은 별도 `UNVERIFIED/HOLD`로 보고

조건을 모두 충족하지 않으면 `완료`라고 표현하지 않고
`부분 완료`, `차단됨`, `추가 수정 필요` 중 하나로 보고한다.

## 15. Reporting

브랜드 단위 작업 결과는 내부 SQL/ID 나열보다 다음 순서로 보고한다.

### 현재 상태
대상 브랜드의 모델/연식 수와 주요 품질 상태

### Audit 결과
추가/수정/중복/충돌/미확인 건수와 대표 항목

### 이번 변경
실제 Production에 반영한 범위

### Data Quality
중복, overlap, 누락, 불확실성, Fitment 영향

### Production QA
DB 재조회 및 실제 서비스/API 확인 결과

### 미완료 / HOLD
근거 부족 또는 충돌로 보류한 대상

### 다음 작업
같은 브랜드에서 남은 작업 또는 다음 브랜드 Batch
