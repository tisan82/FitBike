# FitBike Architecture Guide

**Version:** v1.0\
**Status:** Baseline

## Stack

-   Next.js 16.x / App Router
-   React 19.x
-   TypeScript
-   Tailwind CSS 4
-   Supabase PostgreSQL / Auth / Storage
-   ORM 미사용 baseline

정확한 설치 버전/API는 현재 `package.json`과
`node_modules/next/dist/docs/`를 우선한다.

## Structure

``` text
src/
├── app/
├── components/
├── features/
├── hooks/
├── lib/
├── repositories/
├── services/
├── stores/
├── types/
└── utils/
```

`src/app`은 routing/layout/page composition 역할이다. Page에 substantial
business/data logic을 직접 작성하지 않는다. Feature 고유 코드는
`src/features`에 둔다. 공통 인프라는 `src/lib`를 우선한다.
`src/repositories`는 Supabase DB query와 data access를 담당한다.

Supabase browser/server concern은 기존 구현에 맞춰 분리하고 service-role
credential을 client에 노출하지 않는다.

Task 범위 밖의 대규모 architecture refactoring은 금지한다.
