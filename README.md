# FitBike

FitBike는 바이크 모델과 연식을 기준으로 타이어·배터리·브레이크 등 부품의
Fitment 정보를 제공하는 **Motorcycle Knowledge & Fitment
Platform**입니다.

## Requirements

-   Node.js 22+
-   npm

## Local Setup

``` bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`:

``` text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Validation

``` bash
npm run lint
npm run build
```

## Codex Context

OpenAI Codex는 루트 `AGENTS.md`를 시작점으로 사용합니다.

``` text
docs/
├── 00_ai/
├── 01_product/
├── 02_framework/
├── 03_service_modules/
└── 04_database_schema/
```

DB 관련 작업에서는 `docs/04_database_schema/`의 최신 Supabase export가
exact schema Source of Truth입니다.

## Source Structure

``` text
src/
├── app/
├── components/
├── features/
├── hooks/
├── lib/
├── services/
├── stores/
├── types/
└── utils/
```
