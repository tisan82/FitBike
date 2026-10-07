# Official HTML Source resolver

## Goal
Fix Task 15818's repeated inability to turn a verified official manual page into an actual raster Source. Preserve exact-source policy and the Producer/Reviewer boundary.

## Change
Add authenticated read-only `resolve_visual_source_assets` before Claim. Reuse DNS-pinned public HTTPS with per-hop checks and bounded HTML/XML download, parse actual attributes with htmlparser2, probe raster MIME/signature/decode/SHA, and return bounded PNG previews. No SQL/schema, Claim, Storage, Contract or reservation changes.

## Validation
61 focused regression tests passed, including existing native intake, split protocol, canonical/crop inspection, resolver extraction and signed URL rejection. Independent security review PASS; independent original 57-test rerun PASS. Additional document-mode tests and actual official fixture bring the final local total to 61. Scoped ESLint and diff checks passed.

## Release and actual evidence
MCP v30 ACTIVE, deployed seven-file bundle matched local code byte-for-byte, and authenticated get_visual_generation_capabilities returned sourceAssetResolverSupported=true. Subsequent type annotation-only cleanup is included in final release. No SQL/schema change.

Fresh Polaris HTML extraction returned exactly 0000559948.png and 0000559947.png in section 3.3.6. Fresh 0000559947.png: 398505 bytes,1600x1108,SHA 5c05606b3fe5de9a5dc8a4e075d964efc4f36f4f0068680f3b27868bb324698c. Actual bounded PNG preview rendered and inspected: official RPM instrument diagram with warning region. This proves extraction and raster decode/pixels; it does not assert final Contract QA or READY_FOR_UPLOAD.

Authenticated new resolver invocation remains unverified because this chat tool catalog predates the new tool. Refresh required for discovery. Deno direct network probe in this workspace timed out; curl acquired actual official bytes. Do not describe local curl as deployed DNS-pinned resolver network success. Current Task 15818 remained RETRY/PRODUCTION_PENDING without staging or Claim changes.

## Persistent Knowledge Review
New Global Rules: NONE. Service-specific rule: resolve actual embedded raster assets through the server before staging HTML manuals. Documentation Updated: CONTENT_FACTORY.md. Policy Conflict: NONE.
