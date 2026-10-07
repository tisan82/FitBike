# FitBike Content Visual Contract V5

**Status:** Production compatibility layer deployed; new Stage 2 output target

이 문서는 Stage 2 Writer & Visual Planner와 Stage 3-A Production / Review 사이의 이미지 Contract 경계를 정의한다.

## 1. Ownership

Stage 2는 이미지의 **의미와 사실 경계**만 결정한다.

Stage 2가 결정하는 것은 다음뿐이다.

- 어떤 사용자 질문을 이미지가 지원하는가
- 무엇을 보여줄 것인가
- 반드시 보여야 하는 실제 시각 대상은 무엇인가
- 만들면 안 되는 대상·오인은 무엇인가
- 실제 근거가 필요한가
- 이미 확보된 Evidence가 있다면 어떤 범위까지 지원하는가
- ALT 초안

Stage 2는 Source 탐색 순서, 생성 방식, 구도 타입, Crop, Annotation, Native 호출 방식, 이미지별 Mobile QA 문구를 결정하지 않는다.

## 2. V5 Stage 2 Contract

```yaml
contract_version: 5

image_id: IMG_04
asset_role: BODY

user_question: 흡기 주변에서 직접 볼 수 있는 범위는 어디까지인가?
visual_objective: 흡기 부트와 에어박스가 만나는 외부 연결부를 보여준다.

must_show:
  - 흡기 부트
  - 에어박스 외부
  - 외부 연결부

must_not_show:
  - 가짜 균열 또는 누설
  - 분해 장면
  - 고장 확정 표현

evidence_requirement:
  level: REQUIRED
  fact_ids:
    - CF4
  evidence_ref: []

alt_text_draft: 오토바이 흡기 부트와 에어박스 외부 연결부
```

`pipelineImageId`, `pipelineId`, Contract Hash, Claim, Job ID는 시스템 메타데이터이며 Stage 2가 작성하지 않는다.

## 3. Evidence Requirement

### NONE

일반 장면이다. 서버 공통 정책 범위에서 실제 Source 사용, Reference 재구성, Native 생성 등을 선택할 수 있다.

### REFERENCE

검증한 근거의 구조·형태·범위 안에서만 재구성할 수 있다. 근거 범위를 넘어 모델 위치, 라벨, 경고 표시, 수치 등을 창작하지 않는다.

### REQUIRED

최종 자산은 검증된 실제 또는 공식 Source 기반이어야 한다. Crop, 위치 표시, Annotation 및 근거를 보존하는 허용 편집만 사용할 수 있다. Source가 없다고 해서 Production Worker가 `REFERENCE`나 `NONE`으로 낮추지 않는다.

REQUIRED 근거 미확보 시 Production은 `SOURCE_SELECTION` 단계에서 공식 실패 종료하고 Evidence level을 보존한다. 같은 이유가 반복되면 Stage 2 재설계 후보로 분류한다.

## 4. evidence_ref

확보된 Evidence가 있으면 URL만 전달하지 않는다.

```yaml
evidence_ref:
  - source_ref: "https://..."
    model_scope: "자료에 해당하는 모델·연식"
    supports: "이 Source가 실제로 확인해 주는 구조 또는 사실"
```

`evidence_ref`가 비어 있어도 REQUIRED Contract 자체는 유효하다. 이는 Production이 Source를 탐색해야 한다는 뜻이지 생성으로 대체해도 된다는 뜻이 아니다.

## 5. Stage 2 Basic Lint

Stage 2 완료 전 서버는 다음 기본 모순만 검사한다.

- `contract_version = 5`
- `image_id`, `asset_role`, `user_question`, `visual_objective` 존재
- `must_show`가 비어 있지 않음
- `must_not_show`가 배열임
- Evidence level이 `NONE / REFERENCE / REQUIRED` 중 하나
- `evidence_ref` 항목은 `source_ref`와 `supports`를 포함
- 같은 항목이 `must_show`와 `must_not_show`에 동시에 존재하지 않음

Source 존재 여부, Production 방식, 구도, Annotation 필요성, 상세 Pixel QA를 Stage 2 feasibility로 강제하지 않는다.

## 6. Shared Production Policy

제작 허용 범위는 Stage 2 필드가 아니라 서버 공통 정책이 Evidence level을 해석해 결정한다.

| Evidence | Production 허용 범위 |
| --- | --- |
| `NONE` | Real Source, Crop/Mark, AI Edit, Reference Generation, Full Generation |
| `REFERENCE` | Real Source, Crop/Mark, AI Edit, 검증 범위 내 Reference Generation |
| `REQUIRED` | 검증된 Real Source, Crop/Mark, 근거를 보존하는 AI Edit |

`REQUIRED`는 Reference를 읽었다는 이유만으로 새 이미지를 생성할 수 없다.

사람이 반드시 보여야 하거나 없어야 하는 경우는 Stage 2가 `must_show` / `must_not_show`에 명시한다. 명시가 없으면 공통 정책 기본값을 적용한다.

## 7. Stage 3-A Production Decisions

Production은 현재 Contract와 공통 정책 안에서 다음을 결정하고 **Production Result**로 기록한다.

- 선택한 제작 방식
- 실제 사용 Source / Reference
- Source에서 실제 확인한 사실과 적용 범위
- Native 생성 호출과 반환 자산 연결(생성 경로 사용 시)
- 선택한 Composition
- Crop
- Annotation과 실제 문구
- Job ID
- Source SHA / Canonical SHA
- 사용한 Contract Hash

이 정보는 Stage 2 Contract에 역으로 추가하지 않는다.

## 8. Shared Review Policy

Reviewer는 Production의 PASS 판단을 그대로 승인하지 않는다.

공통 Gate:

1. **Required Visible** — 모든 `must_show` 항목이 실제 픽셀에 존재해야 한다. 일부만 골라 검사하지 않는다.
2. **Prohibited Visible** — 모든 `must_not_show` 항목을 검사한다.
3. **Evidence** — REFERENCE/REQUIRED는 Production Result에 기록된 Source lineage와 최종 표현을 독립 검증한다.
4. **Mobile** — 390px에서 모든 `must_show` 항목을 식별할 수 있어야 한다.
5. **Role Crop** — 실제 THUMBNAIL/HERO/BODY Crop에서도 모든 `must_show`가 식별 가능해야 한다.
6. **Technical** — Decode, Dimensions, SHA-256, Duplicate 검증.

`visual_objective`의 추상 의미는 별도 Pixel Gate가 아니다. 엔진 온도, 성공·실패, 정상·비정상, 의도, 원인처럼 정지 픽셀로 직접 증명할 수 없는 의미는 `must_show`의 실제 시각 대상에 명시되지 않는 한 FAIL 조건으로 사용하지 않는다.

## 9. Stage 3-B Boundary

Stage 3-B는 Semantic Contract를 다시 판정하지 않는다. Reviewer 승인 결과를 기준으로 다음 운영 데이터를 사용한다.

- `pipelineImageId`
- approved staging Job ID
- staging path
- approved SHA-256
- MIME
- width / height
- asset key / asset role
- ALT

Stage 3-B는 승인된 Staging 자산을 Production Storage로 옮기고 SHA 동일성을 검증한 뒤 DONE을 기록한다.

## 10. Compatibility / Migration

- 진행 중 Claim, QA_PENDING, 승인된 후보는 현재 Contract 버전으로 마무리한다.
- 신규 Stage 2 Image Brief는 V5를 사용한다.
- 기존 PENDING/RETRY는 제한이 V5에서 보존되는지 검토한 뒤 전환한다.
- 의미 또는 제한이 바뀌는 전환은 새 Contract Hash를 발급한다.
- 과거 Job, Source SHA, Canonical SHA, 실패/반려 이력을 삭제하지 않는다.
- V4는 호환 계층에서 계속 해석하며 즉시 일괄 삭제하지 않는다.

이 V5 구조는 Contract 충돌과 과도한 Stage 2 지시를 줄이기 위한 것이다. Native 세션 오염, 파일 egress, `BLOCKED_FILE_REFERENCE` 같은 별도 실행 경로 문제를 자동으로 해결하는 정책은 아니다.
