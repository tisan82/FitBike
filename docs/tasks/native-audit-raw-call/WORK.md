# Native audit capture compatibility and 15817 evidence feasibility

## Implementation

RAW_ARGUMENTS_V1 wraps actual native tool name and exact native arguments without renaming runtime-specific keys. Legacy capture remains compatible. Read-only validate_visual_generation_call reports field/reason before Claim. Capture validation is not native runtime validation or generation permission. Ownership, Contract, lease and exact REQUEST/RESULT/PASS checks are retained.

Validation: 41 Node transport/recovery tests passed; scoped ESLint; legacy/raw DB regression in rollback passed before and after Production migration. Independent DB/security review PASS. Native/scheduled generation E2E is reserved for the user's scheduled test.

## 15817 evidence check — LIMITED (2026-10-07)

Task 15817 / IMG_02 / motorcycle-idle-rpm-fluctuation-check.
Current Contract SHA: 77e9003038a9f505ecf04add6ecc5a02fd2284c365a715a50ef39a6d9149328a.
Two original official Honda JPEGs were downloaded and actually viewed:

- https://powersports.honda.com/motorcycle/adventure/-/media/products/family/nc750x/family-gallery/media-thumb/2026/2026-nc750x-gallery-03.jpg
- https://powersports.honda.com/motorcycle/adventure/-/media/products/family/nc750x/panel-features/nc750x-dct/desktop/2027/2027-nc750x-dct-roadsync.jpg

They show actual cockpit/display structure. The large visible zero is speed, not evidence of idle RPM or temperature. Neither photo identifies cold-start versus warmed-up measurement conditions. Asset paths also differ in model year; do not infer the same physical vehicle.
Existing rejected Jobs: 7f765ef3-f809-4705-bd8a-739a38f46d50 and adaf08ae-8656-4734-baaa-ddbeb728b9a7. Do not resume invalidated assets as accepted candidates.

Official sources checked:
- https://powersports.honda.com/motorcycle/adventure/nc750x (product gallery/display)
- https://www.honda.co.uk/motorcycles/range/adventure/nc750x/overview.html (display/features)
- https://webom.hondamotopub.com/webom/HMJ/MKW250/html/JSC002001.html (model-specific idle specification)
- https://cdn.powersports.honda.com/documentum/MWOM/ml.remawmom.2018_31mkl600_nc750x.pdf (different-year owner manual; no year transfer)

Official material establishes instrument context/model-scoped specifications, not a verified cold/warm RPM photo pair. Search queries included NC750X cold start warm idle tachometer RPM and Japanese cold/warm/idle terms. No state-verified pair was established in this bounded search; this is not a claim that no such material exists anywhere.

Generation permitted by the Contract does not establish missing state facts. Current task can proceed unchanged only after suitable state evidence is verified. Contract was not modified and no Production/Reviewer Claim or reservation was started by this development task.

## Nullable prompt follow-up

Reported raw text2im call has prompt:null. Current Work tool image_gen.imagegen instead requires a string prompt; this does not prove the scheduled runtime schema. Raw capture now preserves null/omitted prompt and separately records sceneInstruction and its location. Unknown delivery is explicitly UNOBSERVED, never inferred from JSON equality. Existing pixel approval and Contract/state evidence policy unchanged. Rollback: restore prior three RPC definitions and prior MCP files; no table/data deletion.

Validation follow-up: 42 Node transport/recovery tests PASS, scoped ESLint PASS, full legacy/raw/nullable DB rollback regression PASS before and after migration. Independent DB/security review PASS. Production MCP v29 ACTIVE. Actual authenticated validate_visual_generation_call accepts reported null argument packet with instructionVisibility UNOBSERVED; explicit conversation instruction reports OPERATOR_REPORTED_CONVERSATION; false TOOL_ARGUMENT linkage is rejected. No real Claim/generation/Contract/reservation mutation. Migration 20261007071940.
