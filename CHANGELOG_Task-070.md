# Task-070 Changelog

## Added
- Supabase Auth 기반 Admin Login
- 관리자 이메일 Allowlist 검증
- 브랜드, 모델, 모델·연식, 타이어, 배터리, 타이어 Fitment 관리 화면
- 공통 검색, 등록, 수정, 비활성화 기능

## Environment
`.env.local`에 다음 값을 추가한다.

```env
NEXT_PUBLIC_ADMIN_EMAILS=admin@example.com
```

## Required Supabase Policy
인증된 관리자 계정에 대상 테이블의 SELECT/INSERT/UPDATE 권한과 RLS 정책이 필요하다.
