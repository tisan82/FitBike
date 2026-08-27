import assert from "node:assert/strict";
import test from "node:test";

import { prepareHoldResumeDecision, retryHoldRestorePath } from "./topic-registry.mjs";

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

test("BLOCKED HOLD 재평가는 GENERATING으로 합법 복원하며 Attempt를 한 번만 계산한다", () => {
  assert.deepEqual(prepareHoldResumeDecision({ status: "BLOCKED", attemptCount: 1, countAttempt: true }), { result: "PREPARE", from: "BLOCKED", to: "GENERATING", attemptCount: 2, attemptRecorded: true });
  assert.deepEqual(prepareHoldResumeDecision({ status: "GENERATING", attemptCount: 2, countAttempt: true }), { result: "ALREADY_PREPARED", status: "GENERATING", attemptCount: 2, attemptRecorded: false });
});

test("Attempt Limit은 System 오류가 아닌 Terminal HOLD 결정이다", () => {
  assert.deepEqual(prepareHoldResumeDecision({ status: "BLOCKED", attemptCount: 2, countAttempt: true }), { result: "TERMINAL_HOLD", status: "BLOCKED", attemptCount: 2, attemptRecorded: false });
});

test("합법 Resume 대상이 아닌 Registry 상태는 탐지한다", () => {
  assert.equal(prepareHoldResumeDecision({ status: "PUBLISHED", attemptCount: 1, countAttempt: false }).result, "INVALID_STATE");
});
