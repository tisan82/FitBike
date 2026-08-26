import assert from "node:assert/strict";
import test from "node:test";

import { retryHoldRestorePath } from "./topic-registry.mjs";

test("retry-hold Registry 복원은 BLOCKED에서 기존 합법 전이 GENERATING을 사용한다", () => {
  assert.deepEqual(retryHoldRestorePath("BLOCKED"), ["GENERATING"]);
});

test("이미 GENERATING인 retry-hold 복원은 멱등적이다", () => {
  assert.deepEqual(retryHoldRestorePath("GENERATING"), []);
  assert.deepEqual(retryHoldRestorePath("REVIEW_REQUIRED"), []);
  assert.deepEqual(retryHoldRestorePath("APPROVED"), []);
});

test("BLOCKED에서 REVIEW_REQUIRED로 직접 복원하지 않는다", () => {
  assert.equal(retryHoldRestorePath("BLOCKED").includes("REVIEW_REQUIRED"), false);
  assert.throws(() => retryHoldRestorePath("PUBLISHED"), /INVALID_RETRY_HOLD_RESTORE_STATE/);
});
