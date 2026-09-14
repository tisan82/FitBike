# FitBike AI Development Context

**Version:** v1.0

이 문서는 Codex가 FitBike를 지속적으로 이해하기 위한 문서 지도다.

  영역           문서                                           책임
  -------------- ---------------------------------------------- ---------------------------
  AI 작업        `00_ai/SOP.md`                                 Task 수행 절차
  콘텐츠 Factory `00_ai/CONTENT_FACTORY.md`                     조사·작성·QA·게시 실행 기준
  콘텐츠 Visual  `00_ai/CONTENT_EDITORIAL_VISUAL_STANDARD.md`   이미지 기획·제작·메타데이터·QA 기준
  이미지 Reference `00_ai/GENERATED_IMAGE_REFERENCE_LIBRARY.md` 생성형 AI 참고 이미지 자산 정책
  Product        `01_product/SERVICE.md`                         서비스 목적/원칙
  Architecture   `02_framework/ARCHITECTURE.md`                  코드/레이어 경계
  Database       `02_framework/DATABASE.md`                      데이터 원칙
  API            `02_framework/API.md`                           API 계약
  UX             `02_framework/SCREEN.md`                        공통 UX
  Feature        `03_service_modules/*`                          기능별 정책
  Actual DB      `04_database_schema/*`                          현재 Supabase 정확한 구조

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

## Content Policy Ownership

- `03_service_modules/CONTENT.md`: 사용자가 받는 콘텐츠의 목적, 유형, 안전 표현 원칙과 게시 원칙
- `00_ai/CONTENT_FACTORY.md`: 위 제품 원칙을 조사·작성·검수·게시 단계에서 실행하는 방법
- `00_ai/CONTENT_EDITORIAL_VISUAL_STANDARD.md`: Image Brief, 이미지 구성, 사람 표현, alt/caption과 Image QA
- `00_ai/CONTENT_IMAGE_STORAGE_POLICY.md`: Production 이미지 저장·전달 경로
- `00_ai/GENERATED_IMAGE_REFERENCE_LIBRARY.md`: Reference Asset의 분류와 사용 제한

세부 규칙은 위 책임 문서 한 곳에서만 정의하고 다른 문서는 링크로 참조한다.
`FitBike-Content-Factory/policies/**`는 실행 저장소가 사용하는 동기화 사본이며
정책 원본이 아니다. 정책 변경은 이 저장소에서 먼저 검토한 뒤 동일 커밋 내용으로
사본을 갱신한다.

## Generated Reference Asset Rule

`content-assets/editorial-reference/**` 경로의 대시보드·콜라주·UI mockup·생성형 참고 이미지는 Production 콘텐츠에 직접 노출하지 않는다.

이 자산은 Content Factory/Image Editor가 신규 이미지를 생성할 때 참고하는 **Visual Knowledge Base**이며, 실제 서비스용 자산은 별도의 Production 경로에 새로 생성·최적화한 뒤 사용한다.

상세 정책은 `00_ai/GENERATED_IMAGE_REFERENCE_LIBRARY.md`를 따른다.
