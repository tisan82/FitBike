# FitBike Architecture Guide

**Version:** v1.2  
**Status:** Active Baseline

## 1. Stack

- Next.js 16.x / App Router
- React 19.x
- TypeScript
- Tailwind CSS 4
- Supabase PostgreSQL / Auth / Storage
- ORM 미사용 baseline

정확한 설치 버전과 실행 스크립트는 `package.json`을 우선한다.

## 2. Source Responsibility

```text
src/
├── app/            # Routing, layout, page composition, route handlers
├── components/     # 서비스에 종속되지 않는 공통 UI
├── features/       # 서비스별 화면/컴포넌트/표현 로직
├── lib/            # API/SEO/Supabase 공통 인프라
├── repositories/   # Supabase query 및 data access
├── services/       # 서버 서비스 use-case / 데이터 조합 / 정책 적용
└── types/          # 서비스 간 공유되는 도메인 공통 타입이 생길 때 사용
```

현재 사용하지 않는 빈 계층(`hooks`, `stores`, `utils`)과 빈 공통 컴포넌트 계층은 미리 생성하지 않는다. 실제 공통 코드가 필요할 때 생성한다.

## 3. Service Map

| 서비스 | Route / Entry | Feature | Server Service | Repository |
|---|---|---|---|---|
| Bike Selector | `src/app/bike-selector` | `src/features/bike-selector` | `bike-selector.service.ts` | `bike-selector.repository.ts` |
| Fitment Result | `src/app/fitment-result` | `src/features/fitment-result` | `fitment-result.service.ts` | `fitment-result.repository.ts` |
| Model Detail | `src/app/model-detail` | `src/features/model-detail` | `model-detail.service.ts` | `model-detail.repository.ts` |
| Tire Detail / Tire Model | `src/app/tire-detail`, `src/app/tire-models` | `src/features/tire-detail`, `src/features/tire-model-list` | `tire-detail.service.ts`, tire model loaders | `tire-detail.repository.ts` |
| Battery Detail | `src/app/battery-detail` | `src/features/battery-detail` | `battery-detail.service.ts` | `battery-detail.repository.ts` |
| Content | `src/app/contents` | `src/features/content` | `content.service.ts` | `content.repository.ts` |
| Service Shop | `src/app/shops`, internal service-shop API | `src/features/service-shop` | `service-shop.service.ts` | service-shop data access는 현 구현 위치 유지 |
| Admin | `src/app/admin` | `src/features/admin` | 기능별 기존 service 사용 | 기능별 기존 repository 사용 |
| SEO/GEO | `robots.ts`, `sitemap.xml`, page metadata | 공통 | `src/lib/seo` | `seo.repository.ts` |

`src/features/<service>/services`에 있는 파일은 브라우저에서 `/api/v1`을 호출하는 Client API adapter 역할이다. `src/services`의 서버 도메인 서비스와 이름이 유사하더라도 실행 경계와 책임이 다르므로 단순 중복으로 보고 합치지 않는다.

## 4. Dependency Direction

기본 호출 방향은 아래를 유지한다.

```text
Server: app/route -> service -> repository -> Supabase
Page:   app/page  -> feature
Client: feature   -> feature service(API adapter) -> /api/v1
Shared: app / feature / service / repository -> lib
```

- `src/app`에는 substantial business/data logic을 직접 작성하지 않는다.
- Feature는 UI와 사용자 상호작용을 담당하고 DB에 직접 접근하지 않는다.
- Server Service는 여러 repository 결과를 조합하고 서비스 정책을 적용한다.
- Feature Service는 브라우저 API 호출과 응답 변환만 담당한다.
- Repository는 DB query와 persistence concern만 담당한다.
- `src/lib`는 특정 서비스에 종속되지 않는 공통 인프라와 공통 protocol contract만 둔다.
- service-role credential을 client component에 노출하지 않는다.

## 5. Shared API Contract

API 성공/실패 envelope는 서비스별로 중복 선언하지 않는다.

```text
src/lib/api/
├── response.ts     # NextResponse 생성 helper
└── types.ts        # ApiSuccessResponse / ApiErrorResponse / ApiResponse
```

Feature별 type 파일은 기존 공개 import 경로 호환이 필요하면 `src/lib/api/types.ts`의 타입을 재-export할 수 있다. API envelope 구조를 변경할 때는 공통 contract 한 곳을 우선 수정한다.

## 6. File Placement Rules

1. 하나의 서비스에서만 사용하는 UI는 `src/features/<service>`에 둔다.
2. 두 개 이상 서비스에서 실제로 재사용되는 UI만 `src/components`로 승격한다.
3. DB query는 `src/repositories` 외부에 새로 만들지 않는다.
4. API route는 validation/authorization/response mapping까지만 담당하고 핵심 정책은 server service로 위임한다.
5. 단순 re-export 또는 한 줄 wrapper는 캐시 경계 등 명확한 이유가 없으면 만들지 않는다.
6. 빈 디렉터리를 유지하기 위한 `.gitkeep`은 사용하지 않는다.
7. Client API adapter와 Server Service를 단순 파일명 유사성만으로 통합하지 않는다.

## 7. Cleanup Rules

다음 항목은 운영 소스와 분리하거나 제거한다.

- 사용되지 않는 `.gitkeep`, 빈 placeholder 디렉터리
- 배포 완료 후 더 이상 참조하지 않는 임시 candidate/review 산출물
- 루트에 누적되는 Task별 일회성 결과 문서(필요한 기록은 `docs` 하위 이력 영역으로 이동)
- 동일 기능을 중복 구현한 component/service/repository/type
- 참조되지 않는 loader/helper 및 dead code
- 실제 import가 없는 dependency

단, 삭제 전에는 반드시 import/reference, route 사용 여부, build 영향도를 확인한다. 운영 Route/API/DB schema 변경을 단순 정리 작업과 함께 수행하지 않는다.

## 8. Refactoring Policy

소스 정리는 서비스 단위로 수행한다. 한 번에 전체 구조를 대규모 이동하지 않고 다음 순서를 따른다.

1. Dead code / placeholder 제거
2. 서비스별 책임 확인
3. 중복 코드 통합
4. import 경계 정리
5. lint / build 검증
6. Production smoke test

Task 범위 밖의 대규모 architecture refactoring은 금지한다.
