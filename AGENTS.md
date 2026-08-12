<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# FitBike Codex Development Rules

**Version:** v1.0\
**Status:** Baseline

## Role

FitBike is a Motorcycle Knowledge & Fitment Platform. Implement the
requested Task while preserving product policy, database integrity, API
contracts, UX standards, and existing architecture. Do not redesign the
project from scratch.

## Required reading order

1.  `README.md`
2.  `docs/00_ai/README.md`
3.  `docs/00_ai/SOP.md`
4.  `docs/01_product/SERVICE.md`
5.  Relevant files under `docs/02_framework/`
6.  Relevant Service Module under `docs/03_service_modules/`
7.  Current Task/result/changelog when relevant
8.  Existing implementation code
9.  For DB work, `docs/04_database_schema/` is mandatory

Read only what is relevant to the Task. Do not repeatedly scan the whole
repository for small changes.

## Source of Truth

-   Product/Business: `SERVICE.md` > Service Module > Task >
    implementation
-   Database: current Supabase export in `docs/04_database_schema/` >
    `DATABASE.md` > Service Module > implementation
-   Architecture/API: `ARCHITECTURE.md` + `API.md` > Service Module >
    Task > implementation
-   UI/UX: `SCREEN.md` > Service Module > Task > implementation
-   Public SEO/GEO: `SEO_GEO.md` > Service Module > Task > implementation

Existing code is evidence of current behavior but does not override an
explicit higher-level policy. If sources conflict, do not guess; report
the conflict before a policy/schema-breaking change.

When changing a global customer-facing UI policy, update both the code and
`SCREEN.md` in the same Task.

Before changing a customer-facing public page, review `SEO_GEO.md`. Update it
with the code when a global SEO/GEO policy changes.

## Product guardrails

-   Fitment accuracy is the highest priority.
-   Model + Model Year is the core service axis.
-   Never invent fitment data. Unknown/unverified values remain `NULL`.
-   Information first; do not introduce ranking/recommendation unless
    explicitly requested.
-   Mobile First, Minimal Input, Progressive Disclosure.
-   Preserve Brand → Model → Model Year selection flow.

## Database guardrails

-   No table/column create, rename, or drop without explicit approval.
-   No production data mutation unless explicitly requested.
-   Use exact identifiers from the current Supabase schema.
-   Documentation examples are not schema truth.
-   Avoid `SELECT *` when required fields are known.
-   Preserve constraints and active-data policies.
-   Storage DB values may be object paths; do not hard-code
    environment-specific public URLs into DB data.

## API guardrails

-   `/api/v1` is the baseline public API version.
-   Preserve contracts unless the Task explicitly changes them.
-   No field removal/rename/type change without approval.
-   Keep business/data logic out of page components.

## Task execution

1.  Inspect current implementation.
2.  Check `git status` and `git diff`.
3.  Define minimum file scope.
4.  Modify only required files.
5.  Avoid unrelated refactoring.
6.  Reuse existing utilities/components.
7.  Run relevant validation.
8.  Review whether the Task established persistent development knowledge.
9.  Update the appropriate existing Source of Truth when required.
10. Report result.

## Persistent development knowledge

After implementation and validation, determine whether the Task established a
Product, UX/UI, Architecture, Data, or API rule that future Tasks must follow.
Do not leave such policy only in code, conversation, or a Task result. Update
the smallest appropriate existing Source of Truth document instead of creating
a duplicate document.

Classify decisions before documenting them:

-   Global rules used across services belong in the relevant Product or
    Framework document.
-   Rules limited to one feature belong in its Service Module.
-   Implementation details such as local pixel values, debugging history,
    build output, and temporary fixes remain in code or the Task result.

Do not duplicate the same policy across Global and Service Module documents.
If no persistent rule was established, report `Documentation Update: NONE`.
When a major service gains durable Product/UX/Data contracts and has no Service
Module, propose one; do not create it merely because a screen exists.

If a Task conflicts with an existing Source of Truth, report `POLICY CONFLICT`
with the existing rule, requested rule, and impact, then wait for a decision.
Do not override a Global policy with a Feature requirement without explicit
approval. If code and documentation materially differ, report
`DOCUMENTATION DRIFT` and follow the Source of Truth precedence above rather
than guessing which is correct.

## Normal local validation

-   read/search files
-   `git status`, `git diff`
-   `npm run lint`
-   `npm run build`
-   existing project tests
-   local log inspection

These instructions do not override IDE/OS permission prompts.

## Explicit approval required

-   `git push`
-   deployment
-   destructive Git operations
-   package install/remove
-   environment variable changes
-   Supabase schema/data mutation
-   Supabase Storage upload/move/delete
-   bulk deletion
-   broad refactoring outside Task scope

## Completion report

Report: goal/root cause, changed files, changes made, validation,
remaining issues, and policy/schema conflicts.

For Feature Tasks, also report a Persistent Knowledge Review with New Global
Rules, New Service-specific Rules, Documentation Updated, and Policy Conflict;
use `NONE` where applicable.
