# Native ChatGPT file handoff

## Decision

Ordinary ChatGPT Chat and native image generation/editing only. Remove the external image-provider implementation and configuration guidance. Preserve existing image/Contract records, permission gates, job receipts, normalized generatedInput recovery, Inspection, Approval, 3-B and 4-stage boundaries.

## Implementation

- Official top-level fileParams on dispatch_visual_generation (`file`, `inputFile`); server-computed SHA for PNG/JPEG/WebP.
- Read-only exact task preflight and optional MCP Apps upload/selection widget. No claim renewal or cross-image handoff.
- Native AI-edit source binary identity checked against inspected source URL; editing execution remains operator-attested.
- Existing asynchronous private Staging/readback/job/inspection/approval flow; no new image status or public privileges.
- Service-only native-file identity excludes ephemeral download URL; scrub file URLs after handled failure/preservation.

## Validation

- 29 targeted native-generation/source-stage/MCP regression tests pass.
- ESLint passes with one pre-existing warning in reference-stage.test.mjs.
- Local Deno type check passes using installed pinned npm dependency type mappings; JSR runtime type-only import omitted locally because JSR network access is unavailable.
- Actual JPEG and PNG to WebP/SHA/decode/dimension smoke tests pass at 780px; WebP reprocessing at 390px passes.
- Wider content suite has two pre-existing import/export mismatches: createProductionStages and integrateBodyImages; these files are unchanged by this task.
- Local Next build is blocked by missing public Supabase environment settings. Production Vercel verification uses the configured Git integration.
- Ordinary Chat generated-file transfer, widget rendering and a real image READY_FOR_UPLOAD + claim-release round trip are NOT yet proven by local tests or Work tools.

## Release

Pending main merge, migration, Edge deployment and deployed-file/capability verification. Target image 2009 remains unclaimed until its actual native-file intake route is available. Do not approve a fixture or report server smoke testing as ordinary Chat E2E.
