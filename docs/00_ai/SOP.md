# FitBike AI Development SOP

**Version:** v1.0\
**Status:** Baseline

## Flow

Task → Scope 확인 → 관련 문서 확인 → 현재 코드/Git diff 확인 → 영향도
확인 → 최소 수정 → lint/build/test → Self Review → 결과 보고

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
