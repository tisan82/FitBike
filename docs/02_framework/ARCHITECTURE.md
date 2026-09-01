# FitBike Architecture Guide

**Version:** v1.1  
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
└── types/          # 실제 서비스 간 공유가 확인된 공통 타입
```

현재 사용하지 않는 빈 계층(`hooks`, `stores`, `utils`)은 미리 생성하지 않는다. 실제 공통 코드가 필요할 때 생성한다.

`src/features/<service>/services`는 브라우저에서 `/api/...`를 호출하는 client API adapter를 둘 수 있다. 이는 `src/services`의 server domain service와 역할이 다르므로 이름만 같다는 이유로 통합하지 않는다.

## 3. Service Map

| 서비스 | Route / Entry | Feature | Service | Repository |
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

## 4. Dependency Direction

기본 호출 방향은 아래를 유지한다.

```text
app -> feature -> service -> repository -> Supabase
                 |              |
                 +-> lib <------+
```

Client Component에서 서버 데이터를 필요로 하는 경우에는 다음 경계를 사용한다.

```text
client feature -> feature client API adapter -> /api route -> server service -> repository
```

- `src/app`에는 substantial business/data logic을 직접 작성하지 않는다.
- Feature는 UI와 사용자 상호작용을 담당하고 DB에 직접 접근하지 않는다.
- Server Service는 여러 repository 결과를 조합하고 서비스 정책을 적용한다.
- Feature 내부 service는 필요한 경우 client API adapter 역할만 맡는다.
- Repository는 DB query와 persistence concern만 담당한다.
- `src/lib`는 특정 서비스에 종속되지 않는 공통 인프라만 둔다.
- service-role credential을 client component에 노출하지 않는다.

## 5. File Placement Rules

1. 하나의 서비스에서만 사용하는 UI는 `src/features/<service>`에 둔다.
2. 두 개 이상 서비스에서 실제로 재사용되는 UI만 `src/components`로 승격한다.
3. DB query는 `src/repositories` 외부에 새로 만들지 않는다.
4. API route는 validation/authorization/response mapping까지만 담당하고 핵심 정책은 server service로 위임한다.
5. 단순 re-export 또는 한 줄 wrapper는 캐시 경계 등 명확한 이유가 없으면 만들지 않는다.
6. 빈 디렉터리를 유지하기 위한 `.gitkeep`은 사용하지 않는다.
7. 공통 타입은 실제로 둘 이상의 서비스가 공유할 때만 `src/lib` 또는 `src/types`로 승격한다.
8. 서버 서비스와 client API adapter는 물리적으로 분리하고 client bundle에 server-only 코드를 포함시키지 않는다.

## 6. Cleanup Rules

다음 항목은 운영 소스와 분리하거나 제거한다.

- 사용되지 않는 `.gitkeep`, 빈 placeholder 디렉터리
- Next.js 초기 생성 후 실제 서비스에서 참조하지 않는 기본 template asset
- 배포 완료 후 더 이상 참조하지 않는 임시 candidate/review 산출물
- 루트에 누적되는 Task별 일회성 결과 문서(필요한 기록은 `docs` 하위 이력 영역으로 이동)
- 동일 기능을 중복 구현한 component/service/repository
- 참조되지 않는 loader/helper/type alias 및 dead code
- 실제 import가 없는 dependency

단, 삭제 전에는 반드시 import/reference, route 사용 여부, build 영향도를 확인한다. 운영 Route/API/DB schema 변경을 단순 정리 작업과 함께 수행하지 않는다.

Candidate/review 자산은 최종 선택 근거가 필요한 파일과 현재 기준본만 보존하고, 명확히 superseded 된 중간 버전은 제거한다.

## 7. Refactoring Policy

소스 정리는 서비스 단위로 수행한다. 한 번에 전체 구조를 대규모 이동하지 않고 다음 순서를 따른다.

1. Dead code / placeholder 제거
2. 서비스별 책임 확인
3. 중복 코드 통합
4. import 경계 정리
5. lint / build 검증
6. Production smoke test

Task 범위 밖의 대규모 architecture refactoring은 금지한다.

## 8. Code Diet Verification Checklist

정리 작업에서 파일을 삭제하기 전에 아래를 확인한다.

1. 파일명 또는 export symbol의 repository reference 검색
2. Route/metadata/server cache 등 framework convention에 의해 간접 사용되는지 확인
3. 같은 이름의 server service와 client API adapter를 중복으로 오인하지 않았는지 확인
4. 정적 자산은 코드뿐 아니라 콘텐츠/DB에서 URL로 참조될 가능성이 있는지 확인
5. dependency 제거 시 `package.json`과 lockfile을 함께 갱신할 수 있는 검증 환경인지 확인
6. 검증 환경이 불완전하면 추정 삭제를 확대하지 않는다.
