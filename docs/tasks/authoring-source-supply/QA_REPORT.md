# 설계 및 DB 시제품 검증

날짜: 2026-10-15 KST. 결과: **설계 범위 PASS**. 운영 기능 검증/배포 결과 아님.

## 근거

- GitHub main: `26ce29a74a627e63a52311764cb5f9a97596280b`.
- 운영 schema read-only 조회: 18/19/21/24/27/30/31 컬럼, Authoring/Source ingest/Publisher RPC
  signature, 기존 Storage bucket·용량·MIME, 공급 원장 및 policy column 미존재 확인.
- AGENTS.md, Orchestrator/QA Router, CONTENT.md → CONTENT_FACTORY.md → CONTENT_QUEUE.md,
  API/Architecture/Database/schema 문서 및 실제 Authoring/Source Stage/Native/role 구현 대조.
- Supabase 스킬, 공식 Storage 문서 검색 및 changelog 확인. 이번 설계는 새로운 Supabase
  제품 기능·공개 Storage 정책·외부 모델·확장 의존성을 도입하지 않는다.

## 실행 검증

```bash
PGLITE_MODULE=/workspace/scratch/add31744289b/pixel-test-deps/node_modules/@electric-sql/pglite/dist/index.js \
node --test --test-concurrency=1 docs/tasks/authoring-source-supply/schema-prototype.test.mjs
```

13/13 PASS. 새 패키지를 설치하지 않고 기존 PGlite를 사용했다.

| 검증 경계 | 결과 |
|---|---|
| URL 후보·NULL proof는 공급 완료 아님 | PASS |
| 저장 후 Task 연결 전 readiness false | PASS |
| 참고용은 primary 입력 불가 | PASS |
| Native 편집 필요 Source는 예약 실행 준비 아님 | PASS |
| 다른 run/pipeline/non-authoring 연결 거부 | PASS |
| 다른 Task/Hash 바인딩 거부 | PASS |
| Contract 변경 시 readiness 해제 | PASS |
| 옛 공급 비활성화 → 새 Hash 공급 선택 → 옛 공급 재활성화 거부 | PASS |
| 저장된 SHA/출처·operation intent 불변 | PASS |
| operation·primary 중복 방지 | PASS |
| semantic reject 공급 재사용 방지·파일 증거 보존 | PASS |
| Native 출력의 분류·생성 근거 필수 | PASS |
| RLS 활성·public 역할 권한 차단·service-only 함수 | PASS |

tools-contract.json JSON parse와 변경 파일 공백 검사도 수행했다.

## 독립 QA

저장소 AUDIT 규칙에 따라 독립 에이전트가 설계·시제품을 검토했다.
Contract 변경 후 historical supply의 SUPERSEDED/선택 해제까지 차단되던 guard 결함을 발견했다.
현재 활성 binding에는 current Hash를 요구하되, 기존 immutable binding의 비활성화는 허용하도록
수정했다. 독립 PGlite로 비활성화 성공을 확인했고 자동 회귀검사는 새 공급 선택과 옛 공급
재활성화 거부까지 포함한다. 다른 차단 결함은 보고되지 않았다.

## 미검증 및 후속 구현

- 이 SQL은 **스키마 설계 시제품**이다. `supabase/migrations`에 넣지 않았다.
- production DB migration/DDL, Source 파일 업로드·다운로드, 기존 콘텐츠·상태·예약 변경 없음.
- 원장 생성만으로 서버가 actual SHA/decode/pixels를 검증하는 것은 아니다. 파일 worker와
  authenticated API, prepare/complete/bind RPC, cleanup 보호 구현이 필요하다.
- 권한 테스트는 role ACL/RLS 기본 경계다. 실제 JWT/operator/session 인증 E2E가 아니다.
- 실제 Authoring 저장·Task sync·supply binding 트랜잭션, Queue/Claim 경쟁 및 Stage E2E 미구현.
- Reviewer/Publisher 통합은 설계 검토다. publish receipt/MCP 도구/lease 복구 구현과 E2E 필요.
- 예약에 Native 도구가 제공되는지·파일 egress가 성공하는지·플랫폼 safety block 원인은
  이 검증으로 증명하지 않았다.

Persistent Knowledge Review: Global rule NONE. 향후 구현할 서비스 규칙은 DESIGN_SPEC에
명시했다. 아직 운영 기능이 아니므로 기존 Source of Truth를 적용 완료처럼 수정하지 않았다.
Policy Conflict: NONE. Production Status: **UNCHANGED / NOT DEPLOYED**.
