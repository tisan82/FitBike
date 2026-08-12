# FitBike AI Development SOP

**Version:** v1.0\
**Status:** Baseline

## Flow

Task → Scope 확인 → 관련 문서 확인 → 현재 코드/Git diff 확인 → 영향도
확인 → 최소 수정 → lint/build/test → Self Review → Persistent Knowledge
Review → Documentation Update(필요 시) → 결과 보고 → User Review → Commit

## Before Coding

1.  `AGENTS.md`를 읽는다.
2.  Task 관련 Framework/Service Module만 읽는다.
3.  수정 대상 실제 코드를 확인한다.
4.  미커밋 변경을 확인하여 이전 작업을 덮어쓰지 않는다.
5.  DB 작업이면 `04_database_schema`를 반드시 확인한다.

## Scope

Task 밖 화면 개선, 이름 변경, 구조 개편, DB/API 변경을 임의 수행하지
않는다. 유용한 개선안은 별도 제안으로 보고한다.

## Strict

Database, API Contract, Business Rule, Security/Auth, Fitment Data, Task
Scope는 추측 금지.

## Creative within scope

Layout, accessibility, responsive behavior, information presentation은
정책/계약을 바꾸지 않는 범위에서 개선 가능.

## Validation

실행 가능한 경우 `npm run lint`, `npm run build`, 관련 테스트를
실행한다. 실행하지 않은 검증을 PASS라고 보고하지 않는다.

## Persistent Knowledge Review

구현과 검증 후 "이번 Task에서 다음 개발에서도 알아야 하는 지속 정책이
새롭게 확정되었는가?"를 확인한다.

-   여러 화면/기능에 반복 적용되는 Global 정책은 관련 Product 또는
    Framework Source of Truth에 최소 범위로 반영한다.
-   특정 기능에만 적용되는 정책은 해당 Service Module에 반영한다.
-   CSS pixel 조정, 임시 값, bug/debug 과정, lint/build 결과 같은 구현
    세부사항은 Global 문서에 기록하지 않는다.
-   동일 정책을 Global 문서와 Service Module에 중복 작성하지 않는다.
-   적절한 기존 문서를 우선하며 불필요한 새 문서를 만들지 않는다.

지속 정책이 없으면 결과에 `Documentation Update: NONE`으로 보고한다.
기존 정책과 충돌하면 임의 변경하지 않고 `POLICY CONFLICT`로, 코드와 문서의
중요한 불일치는 `DOCUMENTATION DRIFT`로 보고한다.
