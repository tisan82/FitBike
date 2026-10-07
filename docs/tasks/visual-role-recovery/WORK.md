# Split visual role routing and durable recovery

## Goal / scope
Repair Producer/Reviewer instruction drift, unhanded preflight discovery, final lineage recovery, repeated real Source/PDF processing and PDF rejection scope. AUDIT with separate DB DEV, source worker DEV and independent cross-system QA. Keep existing roles and approval gates. No Content Contract, Native API, reservation, 3-B or publish changes.

## Acceptance
- Producer actual valid preflight -> own handoff -> QA_PENDING/Claim release; no QA record or approval.
- Reviewer current candidate -> actual QA -> exact saved real Source with unchanged base transform -> final QA/approval.
- Technical retry discovers owned saved assets; inactive receipts cannot write; newer unrelated Job cannot hide valid lineage.
- PDF other page is not invalidated by SOURCE_MISMATCH of a different page; same page remains rejected.
- Wrong Worker/Task/Contract/SHA/base transform fail closed; canonical pixels preserve original source attestation SHA separately.
- No claims/data persist from rollback regression fixtures. Production deployment checked independently of scheduled task completion.

## Validation / release
75 affected Node regression tests PASS, including real Magick stored-pixel geometry; scoped ESLint and diff check PASS. SQL role/recovery/page-scope assertions executed against Production inside a transaction and rolled back. Independent code/security QA PASS; final schema check caught and corrected nonexistent stage-job pipeline_id selection and added regression coverage.

Production migration applied; source-stage v28 and visual-mcp v32 ACTIVE. Task 15818 readback returns ROLE_PROTOCOL_V1 Reviewer routing, nativeGenerationAllowed=false, exact stored Job/source SHA and INSPECT_REVIEW_CANDIDATE. Another execution had already handed off candidate 67a004a8-3e0c-487d-a240-c1bb80f082dd into QA_PENDING before this read; this release did not claim or approve that task. Development/deployment validation does not certify scheduled Native generation isolation, egress reliability or complete approval.

## Persistent Knowledge Review
New Global Rules: NONE. Service-specific Rules: role-aware executionProtocol and saved candidate recovery. Documentation Updated: CONTENT_FACTORY.md. Policy Conflict: NONE.
