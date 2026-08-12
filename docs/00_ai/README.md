# FitBike AI Development Context

**Version:** v1.0

이 문서는 Codex가 FitBike를 지속적으로 이해하기 위한 문서 지도다.

  영역           문서                             책임
  -------------- -------------------------------- ---------------------------
  AI 작업        `00_ai/SOP.md`                   Task 수행 절차
  Product        `01_product/SERVICE.md`          서비스 목적/원칙
  Architecture   `02_framework/ARCHITECTURE.md`   코드/레이어 경계
  Database       `02_framework/DATABASE.md`       데이터 원칙
  API            `02_framework/API.md`            API 계약
  UX             `02_framework/SCREEN.md`         공통 UX
  Feature        `03_service_modules/*`           기능별 정책
  Actual DB      `04_database_schema/*`           현재 Supabase 정확한 구조

`AGENTS.md`가 AI 작업의 최상위 진입점이다.

Task에서 확정된 지속 정책은 새 문서를 만들기 전에 위 Source of Truth에
다음 기준으로 반영한다.

-   여러 기능에 적용되는 Global Product/UX/Architecture/Data/API 정책:
    해당 `01_product` 또는 `02_framework` 문서
-   특정 기능에만 적용되는 정책: 해당 `03_service_modules` 문서
-   local pixel 값, 임시 구현, debugging 과정 등 구현 세부사항: 코드 또는
    Task 결과

동일 정책을 Global 문서와 Service Module에 중복 기록하지 않는다. 새로운
주요 Service에 지속적인 Product/UX/Data contract가 충분한데 관련 Service
Module이 없을 때만 새 Module 문서 생성을 제안한다.
