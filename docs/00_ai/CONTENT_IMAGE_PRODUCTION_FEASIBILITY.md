# FitBike Image Production Feasibility Gate

**Status:** Mandatory  
**Scope:** 2단계 Writer & Visual Planner → 3-A Visual Image Producer

## 1. 목적

2단계는 시각적으로 이상적인 Image Contract가 아니라 **현재 3-A가 실제 Production Image로 완료할 수 있는 Contract**를 만든다.

핵심 원칙은 다음과 같다.

> 사실은 엄격하게 고정하고, 표현 방식은 가능한 범위에서 유연하게 허용한다.

`PENDING`은 단순히 Image Brief가 작성된 상태가 아니다. 다음 조건을 모두 만족하는 **3-A Ready 상태**다.

- `image_brief != null`
- `generation_contract != null`
- `generation_contract_hash != null`
- `production_feasibility.status = PASS`
- 현재 3-A Capability로 실제 제작 가능

## 2. 단일 Production Image 원칙

기본값은 `1 Image Task = 1 핵심 질문 = 1 주요 시각 대상 = 단일 Source로 충족 가능`이다.

다음 구조를 PENDING Contract로 만들지 않는다.

- 서로 다른 Source 2개 이상을 반드시 한 이미지에 합성해야 하는 구성
- 서로 다른 제조사/제품의 실제 라벨을 동시에 보존해야 하는 구성
- 복수 Source Composition 없이는 `must_show`를 충족할 수 없는 구성
- 390px에서 여러 제품·절차·비교 대상을 동시에 식별해야 하는 구성
- `full_generation_allowed=false`인데 Full AI Generation이 사실상 필수인 구성
- `generation_allowed=false`인데 단일 실사 Source로 `must_show` 충족이 불가능한 구성

복수 대상 비교가 필요하면 여러 Image Task로 분리하고 본문에서 연속 배치한다.

## 3. must_show 최소화

`must_show`에는 시각적으로 검증 가능한 필수 요소만 넣는다.

권장 범위:

- 핵심 피사체 1개
- 핵심 확인 지점 1개
- 필요한 Context 1개

관리법 차이, 교체 주기 차이, 성능 비교, 상태 해석처럼 본문이 더 적합한 정보는 이미지 필수조건으로 만들지 않는다.

Hero는 콘텐츠 전체를 증명하는 이미지가 아니다. Hero의 목적은 다음과 같다.

- 콘텐츠 주제 인식
- 핵심 대상 식별
- 실제 오토바이/부품/정비 Context 전달
- Card/Hero Crop 대응
- 390px 가독성

세부 비교 근거는 BODY 이미지로 분리한다.

## 4. Reference와 Production Image 분리

Reference는 사실 검증용이고 Production Image는 사용자 설명용이다.

모든 Image Brief는 필요에 따라 다음을 명시한다.

- `reference_fact_required`
- `production_source_required`

예:

```json
{
  "reference_fact_required": true,
  "production_source_required": false
}
```

위 경우 공식/검증 자료로 사실을 확인하되, Production Image는 사실을 바꾸지 않는 범위에서 Reference 기반 재구성을 허용할 수 있다.

특정 실물 픽셀·라벨·문자·숫자가 사실 자체인 경우에만 `production_source_required=true`를 사용한다.

## 5. Production Flexibility

모든 신규/재설계 Image Brief는 `production_flexibility`를 가진다.

```json
{
  "exact_source_required": false,
  "exact_text_required": false,
  "exact_number_required": false,
  "reference_based_reconstruction_allowed": true,
  "generic_visual_allowed": true,
  "example_context_allowed": true,
  "source_substitution_allowed": true
}
```

`exact_*_required=true`는 콘텐츠 사실상 반드시 필요한 경우에만 사용한다.

실제 숫자·제품명·업체명·전화번호·정비이력 등이 핵심이 아니라면 생성하지 않는다. 필요하면 숫자나 라벨이 식별되지 않는 구도 또는 명확한 예시 Context를 사용한다.

## 6. Production Feasibility

모든 신규/재설계 Image Brief는 다음 값을 가진다.

```json
{
  "production_feasibility": {
    "status": "PASS",
    "single_source_satisfiable": true,
    "multi_source_composition_required": false,
    "full_generation_required": false,
    "mobile_single_question": true
  }
}
```

다음 중 하나라도 충족하지 못하면 `PENDING`으로 넘기지 않는다.

- 단일 Source 또는 현재 지원 Production Path로 충족 가능
- Multi-Source Composition이 필수 아님
- 허용되지 않은 Full Generation이 필수 아님
- 390px에서 핵심 질문 하나가 이해 가능
- `must_show`와 `must_not_show`가 모순되지 않음
- Source Strategy와 `generation_allowed`, `real_source_required`, `full_generation_allowed`가 일치

실패 시 우선순위:

1. `must_show` 단순화
2. 단일 Source 구조로 변경
3. Image Task 분리
4. Hero/BODY 역할 재배치
5. Source Strategy 변경
6. 그래도 제작 불가능한 경우에만 HOLD

## 7. 허용 Production Path

Contract가 허용하는 범위에서 다음 경로를 사용한다.

1. `REAL_SOURCE_DIRECT`
2. `REAL_SOURCE_CROP_OR_MARK`
3. `REAL_SOURCE_AI_EDIT`
4. `REFERENCE_BASED_GENERATION`
5. `OFFICIAL_PDF_CROP` — 최후 fallback, 실제로 필요한 경우만

지원되지 않는 Production Method를 관성적으로 `source_priority`에 넣지 않는다.

`full_generation_allowed=false`이면 `FULL_AI_GENERATION`을 `source_priority`에 넣지 않는다.

`ai_edit_allowed=false`이면 `REAL_SOURCE_AI_EDIT`를 넣지 않는다.

## 8. 실제 Source와 정확 문자/숫자

다음은 실제 Source 픽셀 보존이 필요한 대표 사례다.

- 실제 타이어 규격 각인
- 실제 제품 라벨/품번
- 실제 토크렌치 단위·눈금
- 특정 계기판 경고·문자
- 사실 자체인 정확 수치

이 경우 `production_source_required=true` 및 필요한 `exact_*_required=true`를 사용하고, AI가 해당 문자·숫자를 새로 만들거나 변경하지 않는다.

반대로 제품군·구조·관리 개념 자체가 목적이면 특정 라벨을 필수조건으로 만들지 않는다.

## 9. PDF 정책

공식 PDF/매뉴얼은 사실 검증 Source로 사용할 수 있으나 Production Image 기본 경로가 아니다.

- 웹 실사 또는 독립적인 실사 Source 우선
- Reference 기반 재구성 가능 여부 확인
- PDF Crop은 최후 fallback
- 페이지 전체 화면을 Production Image로 사용하지 않음
- Manual/PDF Visual을 Image Brief의 필수조건으로 만들지 않음

## 10. 3-A RETRY Feedback

다음 실패가 반복되면 동일 Contract를 재시도하지 않는다.

- `MULTI_SOURCE_COMPOSITION_REQUIRED`
- `MULTI_FILTER_COMPARISON_NOT_SATISFIED`
- `VERIFIED_PRODUCT_IMAGE_ASSET_NOT_RESOLVED`
- `CONTENT_ISOLATION_VIOLATION`
- 반복적인 `SOURCE_SELECTION` 실패

Writer & Visual Planner가 Contract를 재설계한다.

동일 Contract Hash로 같은 구조적 실패를 반복하지 않는다.

## 11. Server Gate

`WRITING → DRAFTED` 완료는 다음과 원자적으로 처리한다.

1. 모든 Image Brief의 `production_feasibility` 검증
2. Writer Artifact 저장
3. Image Task Sync
4. Generation Contract 생성
5. Generation Contract Hash 생성
6. 모든 활성 Image Task의 Feasibility PASS 재확인
7. 모두 통과한 경우에만 Writer Run PASS / `DRAFTED`

하나라도 실패하면 전체 완료를 롤백하고 `WRITING` 상태를 유지한다.

3-A Claim은 2단계에서 저장한 Generation Contract와 Hash를 immutable 기준으로 사용한다. Claim 시 Contract를 새로 설계하지 않는다.

## 12. 기존 Legacy Contract

기존 `contract_version=3` Task는 운영 중인 Queue를 일괄 차단하지 않기 위해 Legacy로 유지할 수 있다.

다만 반복 RETRY가 발생하거나 Writer 재설계가 들어가는 즉시 Contract v4로 전환한다.

신규 2단계 완료 및 재설계 Task는 반드시 Contract v4 + `production_feasibility=PASS`를 사용한다.
