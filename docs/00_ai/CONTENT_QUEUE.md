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
