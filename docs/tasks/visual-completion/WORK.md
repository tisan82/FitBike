# 3-A completion reliability

P0: return full-resolution lossless PNG decoded from the SHA-verified canonical WebP, plus a 390px PNG. Preserve canonical SHA identity and keep semantic QA unevaluated until an operator views the images. Prefer recoverable staged assets and valid handoffs before new work, without bypassing cooldown, HOLD, or ownership.

P1: build a task-only native generation packet from the immutable Contract. No inherited images; inspect each generated result and correct/regenerate up to three attempts under the same active Claim. The server cannot invoke native ChatGPT image generation or Vision QA; these remain operator runtime steps and must never be reported as automatic server QA.

P2: extend the existing Writer feasibility validator with deterministic contradictions and exact-source evidence checks. Unverified semantic source existence cannot be inferred by string matching.

Rollback: restore prior Edge Function version and previous function definitions; no table, column, or asset migration.

Validation: 35 transport/reference tests plus real ImageMagick decoded-pixel identity/390px test; transactional SQL checks for staged priority, HOLD/cooldown protection and Writer evidence gates; independent read-only QA. Edge Function v21 deployed. Live 15537 inspection returned two viewable PNGs (629×446, 390×277), with original SHA preserved. The actual asset is a clock-settings manual incorrectly labeled “오일압 표시”, so no content approval or status mutation was performed. Task 15669 returns the current Contract-only native generation packet.

Limitations: task-only prompt construction does not establish host session isolation; native runtime must execute generation and visual QA/retry. Server-side automated Vision/model calls are unsupported by the permitted native-only workflow. Deterministic feasibility catches exact contradictions and required evidence declarations, not arbitrary semantic contradictions or live URL availability. No simultaneous-session race test was performed; existing locks/ownership guards are preserved and transactional closure regressions run.

Changelog: canonical display WebP replaced with full-resolution lossless PNG; 390px image preserved; recovery claim order added; current-task native packet and three-attempt runtime instructions added; existing Writer validator extended without modifying tables or stored assets.
