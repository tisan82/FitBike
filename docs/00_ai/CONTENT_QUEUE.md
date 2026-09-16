# FitBike Content Queue Factory Policy

**Version:** v1.0  
**Status:** Source of Truth extension for `CONTENT_FACTORY.md`

## 1. Purpose

Content Queue의 선택, 기존 제작 여부 확인, 중복 회피, 다음 Candidate 선택과 처리 결과 동기화는 사용자가 아니라 Content Factory의 책임이다.

사용자는 개별 Topic의 제작 여부를 기억하거나 직접 건너뛸 필요가 없다. 사용자가 `큐에서 다음 콘텐츠를 만들어서 게시해줘`와 같이 요청하면 Factory가 `16_content_topic`과 실제 Content/Production 상태를 교차 검증하여 다음 실행 대상을 결정한다.

이 문서는 `docs/00_ai/CONTENT_FACTORY.md`의 Queue 실행 규칙을 확장한다. 충돌 시 `CONTENT_FACTORY.md`의 제품/품질 정책을 유지하고 이 문서는 Queue 선택과 reconciliation에 적용한다.

## 2. Factory Owns the Queue

Factory는 실행 시작 시 바로 첫 PLANNED row를 제작하지 않는다.

반드시 다음을 수행한다.

`QUEUE LOAD → CANDIDATE SELECT → RECONCILE → DUPLICATE/INTENT CHECK → SKIP/SYNC/PROCESS → NEXT CANDIDATE`

Queue 관리 책임에는 다음이 포함된다.

- 현재 제작 가능한 Topic 목록 조회
- priority가 있으면 priority 우선, 동률이면 기존 queue ordering/등록순 사용
- 이미 제작된 Topic 식별
- Topic 상태와 실제 Content 상태 불일치 탐지
- 실제 Production 존재 여부 확인
- 제목이 달라도 동일 Search/User Intent인 기존 Content 탐지
- 기존 제작 건을 새로 생성하지 않고 SKIP
- 가능한 범위에서 Topic 상태/연결 정보를 실제 상태와 동기화
- SKIP/HOLD 이후 같은 실행에서 다음 Candidate로 진행
- 정상 게시 완료 후 다음 실행이 자연스럽게 다음 미제작 Topic부터 시작하도록 상태 유지

### Candidate Discovery and Registration Gate

주제는 FitBike DB의 모델·부품 조합이나 만들기 쉬운 이미지에서 시작하지 않는다. 사용자 질문,
사이트 내 검색과 검색 유입, 반복되는 관리 문의, 공식 문서의 이해 난점, 기존 콘텐츠의 독립적인
후속 질문, 계절·보관·세차·중고 인수 같은 실제 이용 상황에서 Candidate를 발견한다. 근거 Data가
없으면 수요 수치를 만들지 않고 `discovery_basis`를 가설과 관찰 근거로 기록한다.

제작 가능한 Topic으로 등록하기 전에 최소 다음 정보를 확정한다.

- `customer_question`, `primary_answer`, `target_reader`, `content_goal`
- normalized subject/action/scope와 모델·연식 범위
- Content Type과 Purpose Template
- `required_coverage`, `excluded_claims`, Critical Facts, Risk
- Evidence 확보 가능성, Visual 필요성
- 가장 가까운 기존 Topic/Content와 독립 가치 설명

제목만 있는 Candidate는 바로 `PLANNED` 제작 대상으로 보지 않는다. 현재 DB column에 담기지 않는
정보는 schema를 임의 변경하지 않고 Candidate Artifact에 보존한다.

Priority 1은 반복성·영향도가 높거나 안전 오해/기존 오류를 바로잡는 질문, Priority 2는 근거가
명확한 일반 유지관리·DIY·부품 질문, Priority 3은 좁은 Long-tail·계절성·선택적 설명 주제다.
동일 Priority는 오래된 항목을 먼저 처리하되 긴급한 정정은 근거를 기록하고 앞당길 수 있다.

## 3. Candidate Reconciliation

Candidate마다 최소 다음 세 계층을 교차 확인한다.

1. **Queue State** — `16_content_topic`의 현재 상태와 식별자
2. **Content State** — 실제 콘텐츠 DB에서 동일/연결 `content_key`, title, intent 또는 기존 artifact 존재 여부
3. **Production State** — 실제 서비스 `/contents/[contentKey]` 또는 현재 서비스의 canonical content URL이 정상 노출되는지

Topic의 상태 하나만으로 제작 여부를 확정하지 않는다.

예:

- Topic = `PLANNED`, 실제 Content + Production 존재 → 새로 만들지 않는다. `SKIP_EXISTING`으로 판단하고 가능한 상태 동기화 후 다음 Candidate로 이동한다.
- Topic = `PUBLISHED`, Content DB 없음 또는 Production 404 → 완료로 간주하지 않는다. 불일치를 기록하고 복구 가능성을 판단한다.
- Topic 제목은 다르지만 기존 콘텐츠와 동일한 핵심 질문/검색 Intent → 신규 생성 전에 cannibalization/duplicate 판단을 수행한다.

## 4. Duplicate and Intent Rules

Exact title match만 검사해서는 안 된다.

다음을 비교한다.

- 핵심 사용자 질문
- 해결하려는 문제
- 대상 부품/차종/상황
- 예상 검색 Intent
- 기존 콘텐츠가 제공하는 핵심 답
- 신규 Topic이 추가하는 독립적인 사용자 가치

판정:

- `EXACT_EXISTING`: 동일 콘텐츠가 이미 존재 → SKIP
- `INTENT_DUPLICATE`: 제목은 다르지만 사실상 같은 질문 → 신규 생성하지 않음
- `OVERLAP_BUT_DISTINCT`: 일부 겹치지만 독립적인 질문/가치가 있음 → 제작 가능
- `NEW`: 기존 콘텐츠가 해결하지 않는 질문 → 제작

기존 콘텐츠의 단순 보강으로 해결되는 Topic은 별도 신규 콘텐츠를 만들어 SEO/Content cannibalization을 만들지 않는다.

### Comparison Set and Dimensions

중복 검사는 Published만 보지 않고 비활성 Content, 모든 미종료 Queue 상태, BLOCKED/Review 작업,
저장된 Work Package, Legacy URL/Redirect/Canonical도 함께 확인한다. 비교 범위는 Title/Summary뿐
아니라 Heading, List, Table, Body의 Primary Answer와 Model/Year Relation을 포함한다.

다음 8개 축을 비교한다.

1. 사용자 질문
2. 대상 부품·개념
3. 확인·관리·교체·선택·이해 등 행동/판단
4. Generic·상황·Model·Model-Year·Product 범위
5. 대상 독자와 이용 상황
6. 핵심 답과 다음 행동
7. 필수 Coverage와 근거
8. 검색 결과에서 약속하는 Title/Summary

단어 중첩 점수는 검토 후보를 찾는 도구일 뿐 최종 중복 판정이 아니다. 특히 한국어 복합어와
표현이 다른 동일 질문을 의미적으로 다시 확인한다.

판정과 처리는 다음과 같다.

- `EXACT_EXISTING`: 같은 질문·답·범위·결과 → 기존 Content 연결, 신규 생성 금지
- `INTENT_DUPLICATE`: 표현만 다르고 사실상 같은 답 → Duplicate 또는 기존 Content 통합
- `UPDATE_EXISTING`: 부족한 문단·이미지·최신 근거·정정 중심 → 기존 Canonical 보강
- `CONSOLIDATE`: 약한 중복 문서가 여러 개 → 하나로 합치고 Redirect/비활성 처리
- `OVERLAP_BUT_DISTINCT`: 대상은 같지만 판단·상황·범위·다음 행동이 다름 → 차이를 기록하고 생성
- `MODEL_VARIANT`: Generic과 달리 공식 모델/연식 구조가 답을 실질적으로 바꿈 → 별도 제작 가능
- `NEW`: 기존 답이 없음 → 제작
- `HOLD_SCOPE`: 독립 가치를 명확히 설명할 수 없음 → 범위 재정의

별도 콘텐츠를 만들려면 `기존 콘텐츠가 답하는 질문`, `신규 Candidate가 답하는 다른 질문`,
`별도 URL이 필요한 이유`를 한 문장씩 기록한다. 제목 표현만 바꿔서는 독립 가치가 아니다.

중복 Gate는 Topic 등록 시, Queue에서 제작 선택 시, Outline/Primary Answer 완성 후, Publish 직전
총 4회 수행한다. 조사 중 Subject가 바뀌면 최초 판정이 PASS였어도 다시 판정한다.

### Update Before New URL

기존 콘텐츠의 한 섹션 추가, 이미지 교체, 문장 개선, Fact 정정, 같은 질문에 대한 모델 예시 추가로
해결되면 신규 URL보다 기존 문서 보강을 우선한다. 독자·판단·근거·다음 행동이 실질적으로 다를
때만 신규 Content를 만든다. 통합 시 더 강한 Canonical을 유지하고 고유 정보를 합친 뒤 Relation,
내부 링크, Redirect 또는 비활성 상태를 함께 정리한다.

## 5. Continue, Do Not Stop

개별 Candidate가 기존 제작, 중복, 보류 상태라고 해서 Queue 실행 전체를 중단하지 않는다.

기본 동작:

```text
Candidate A → SKIP_EXISTING → next
Candidate B → INTENT_DUPLICATE → next
Candidate C → HOLD_CONTENT → next
Candidate D → NEW → Content Factory 실행
```

사용자가 `다음 콘텐츠 1개`를 요청한 경우 목표는 **검사한 첫 row 1개**가 아니라 **실제로 제작 가능한 다음 신규 콘텐츠 1개를 찾아 처리하는 것**이다.

Queue 전체를 처리하라는 요청이면 Candidate 단위 실패를 격리하고 계속 진행한다. 전역 데이터 무결성, 인증/권한, schema mismatch 등 이후 모든 Candidate에 동일하게 영향을 주는 Global Fatal 상황에서만 Batch를 중단한다.

## 6. Queue Status Semantics

현재 DB schema에 이미 존재하는 상태 값을 우선 사용한다. 이 문서 때문에 새 enum/column/table을 임의 생성하지 않는다.

논리적 처리 결과는 다음 의미를 가진다. 실제 DB 값은 현재 schema와 매핑한다.

- `PLANNED`: 아직 제작 대상으로 남아 있음
- `IN_PROGRESS`: Factory가 현재 처리 중
- `PUBLISHED`: Content DB와 Production이 확인된 완료 상태
- `HOLD`: 사람이 판단하거나 외부 조건이 필요한 상태
- `SKIP_EXISTING`: 기존 게시물을 확인해 신규 제작하지 않음
- `INTENT_DUPLICATE`: 기존 콘텐츠와 Intent가 중복되어 신규 제작하지 않음
- `FAILED`: Candidate 고유 실패. 다음 Candidate 진행 가능

schema가 이러한 값을 직접 지원하지 않으면 기존 status와 현재 메모/결과 필드 범위에서 표현하고, schema 변경이 필요하면 별도 승인 대상으로 보고한다.

## 7. State Synchronization

Factory는 DB mutation 권한과 사용자 승인 범위가 허용되는 경우 Queue 상태를 실제 서비스 상태에 맞게 동기화한다.

동기화 전에 실제 Content DB와 Production을 확인한다.

동기화 예:

- PLANNED + existing published content → 완료/기존 존재 상태로 동기화
- IN_PROGRESS + Production already published → Production QA 후 완료 상태로 복구
- PUBLISHED + Production unavailable → 불일치 기록, 원인 확인 및 복구

상태를 맞추기 위해 실제 콘텐츠를 삭제하거나 덮어쓰지 않는다.

## 8. Production Is the Final Completion Check

`PUBLISHED` 판정은 단순 DB insert 성공이 아니다.

최소 확인:

- Content record 존재
- 필요한 Content body/asset 연결 존재
- canonical production URL 접근 가능
- 주요 이미지가 정상 렌더링
- Topic과 Content가 올바르게 연결/추적 가능

Production이 확인되지 않으면 다음 실행에서 완료로 무조건 Skip하지 않고 recovery 대상인지 확인한다.

## 9. User Interaction Contract

정상 운영에서 사용자는 다음을 직접 하지 않는다.

- 어떤 Topic이 다음인지 찾기
- 기존에 만들었는지 기억하기
- 기존 Content URL과 비교하기
- 중복 Topic을 직접 Skip하기
- Candidate 실패 후 다음 Topic을 다시 요청하기

사용자 요청 예:

`큐에서 다음 콘텐츠 1개 만들어서 게시해줘.`

Factory 책임:

1. Queue 조회
2. Candidate 순회
3. 기존/중복/Production reconciliation
4. 필요한 상태 동기화
5. 다음 신규 Candidate 선정
6. `CONTENT_FACTORY.md` 전체 제작 프로세스 실행
7. Production 검증
8. Queue 결과 갱신
9. 사용자에게 처리한 Topic, Skip/Hold 내역, Production URL 보고

## 10. Reporting

완료 보고는 내부 ID만 나열하지 않는다.

최소 보고:

- 이번 실행에서 검사한 Queue 범위
- 기존 제작으로 Skip한 Topic 수
- Intent 중복으로 Skip/Hold한 Topic 수
- 실제로 제작한 Topic
- 현재 제작 단계 또는 최종 상태
- Production에서 사용자가 볼 수 있는 결과
- 남은 Blocker
- 다음 실행 시 시작될 Queue 위치/다음 Candidate

이 규칙의 목적은 사용자가 Queue의 내부 상태를 기억하지 않고도 `다음 콘텐츠 제작`만 요청하면 Factory가 안전하게 이어서 운영되도록 하는 것이다.

## 11. Queue Policy Improvement

### Queue policy review method

Queue 정책도 실제 문제를 기준으로 수정한다. 검토 단위는 제목이 아니라 `customer_question → primary_answer → required_coverage → excluded_claims → risk → priority` 전체다.

정책 개선 시 다음 표를 먼저 작성하고 이 문서의 관련 절을 직접 수정한다.

| 항목 | 질문 |
|---|---|
| Observed problem | 실제 Queue에서 어떤 잘못된 선택·중복·우선순위가 발생했는가 |
| User impact | 사용자가 어떤 답을 중복해서 보거나 필요한 답을 늦게 받는가 |
| Root cause | 발굴, 등록 Gate, Intent 비교, Priority, Reconciliation 중 어디가 약한가 |
| Rule | 다음 Candidate에도 적용 가능한 규칙은 무엇인가 |
| Good example | 질문·답·범위가 분명한 Topic은 무엇인가 |
| Avoid example | 제목만 있거나 기존 글과 답이 같은 Topic은 무엇인가 |
| Verification | 등록 전·제작 선택·Outline 후·게시 전 중 어디에서 검사하는가 |

### Current queue problems and improved examples

#### 1. 제목 중심 Topic

피할 예:

```text
topic: 오토바이 키 점검
customer_question: 없음
primary_answer: 없음
```

좋은 예:

```text
topic: 오토바이 메인 스위치와 키 작동 상태 확인 방법
customer_question: 키가 뻑뻑하거나 한 번에 켜지지 않을 때 무엇을 확인해야 할까?
primary_answer: 키 상태, 예비 키 비교, 핸들락 압력과 전원 반응을 확인하고 강제 조작은 피한다.
required_coverage: 키 휨·마모, 핸들락 압력, 스위치 주변, 계기판 반응, 스마트키 차이
excluded_claims: 공구로 키 비틀기, 임의 윤활, 도난방지 우회
```

등록 Gate는 제목만 있고 핵심 질문·답·필수 범위가 없는 Candidate를 `PLANNED`로 등록하지 않는다.

#### 2. 대상만 같으면 중복으로 판정

피할 판정:

```text
기존: 타이어 공기압 확인
신규: 타이어 밸브 스템 균열 확인
결론: 둘 다 타이어이므로 중복
```

좋은 판정:

```text
대상은 타이어로 겹치지만,
기존은 공기압 측정,
신규는 밸브 외관과 누기 위험을 확인하므로 OVERLAP_BUT_DISTINCT
```

Subject 일치만으로 중복 처리하지 않고 질문, 판단, 다음 행동이 같은지 비교한다.

#### 3. Priority 근거 부족

Priority는 콘텐츠를 만들기 쉬운 순서나 이미지 확보 순서가 아니다.

- Priority 1: 안전 오해, 반복 질문, 기존 오류를 바로잡는 주제
- Priority 2: 공식 근거가 확보된 일반 관리·부품 질문
- Priority 3: 좁은 Long-tail, 계절성, 선택적 설명

긴급 정정 외에는 동일 Priority에서 `created_at ASC → content_topic_id ASC`를 유지한다. 우선순위를 바꿀 때는 변경 이유를 Queue Artifact 또는 현재 지원되는 운영 기록에 남긴다.

#### 4. 기존 콘텐츠 보강으로 충분한데 신규 URL 생성

기존 문서에 한 섹션, 이미지, 최신 근거를 추가하면 같은 질문을 충분히 해결할 수 있는 경우 `UPDATE_EXISTING`으로 판정한다. 별도 URL은 독자, 상황, 판단 또는 다음 행동이 실질적으로 달라야 한다.

### Registration readiness

Candidate는 다음 조건을 모두 만족한 뒤에만 제작 가능한 `PLANNED`가 된다.

- 사용자 질문이 한 문장으로 구체적임
- Primary Answer가 질문에 직접 답함
- Required Coverage와 Excluded Claims가 서로 충돌하지 않음
- 공식 또는 권위 자료 확보 가능성을 확인함
- 가장 가까운 기존 Content와의 차이를 설명함
- Risk와 Automation Level이 저장됨
- Priority와 그 근거가 정책에 부합함
