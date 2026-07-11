# FitBike

FitBike는 바이크 모델과 연식을 기준으로 타이어·배터리 등 부품의 Fitment 정보를 제공하는 서비스입니다.

## Requirements

- Node.js 20+
- npm

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에 Supabase 프로젝트 값을 입력합니다.

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Validation

```bash
npm run lint
npm run build
```

## Source Structure

```text
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
