import assert from "node:assert/strict";
import test from "node:test";

import { auditHoldResume, holdResumeMatrix, resolveHoldResumePolicy } from "./hold-resume-policy.mjs";

test("HOLD Reason별 Resume Stage와 Artifact 재사용 정책을 명시한다", () => {
  assert.equal(holdResumeMatrix.CRITICAL_CLAIM_UNVERIFIED.resumeStage, "RESEARCH");
  assert.equal(holdResumeMatrix.CRITICAL_CLAIM_UNVERIFIED.countAttempt, true);
  assert.equal(holdResumeMatrix.FACT_QA_FAILED.resumeStage, "CONTENT_QA");
  assert.equal(holdResumeMatrix.CONTENT_QA_FAILED.resumeStage, "CONTENT_QA");
  assert.equal(holdResumeMatrix.IMAGE_QA_FAILED.resumeStage, "ASSET_GENERATION_OR_SELECTION");
  assert.equal(holdResumeMatrix.ASSET_DATA_ISSUE.resumeStage, "ASSET_GENERATION_OR_SELECTION");
});

test("Duplicate Terminal HOLD와 알 수 없는 HOLD는 무한 재시도하지 않는다", () => {
  assert.equal(holdResumeMatrix.UNRESOLVED_DUPLICATE.retryable, false);
  assert.equal(resolveHoldResumePolicy({ history: [{ state: "HOLD_CONTENT", reason: "UNKNOWN" }] }).retryable, false);
});

test("Published, Drop, Pending QA는 HOLD Resume Matrix 입력이 아니다", () => {
  for (const state of ["PUBLISHED_VERIFIED", "DROP", "PUBLISHED_PENDING_QA"]) {
    const policy = resolveHoldResumePolicy({ state, history: [] });
    assert.equal(policy.retryable, false);
  }
});

test("현재 HOLD 8건 Matrix는 BLOCKED attempt 1에서 Research 재평가 가능하다", () => {
  const keys = ["nmax-tire", "nmax-battery", "nmax-brake", "forza-tire", "forza-battery", "adv-tire", "xmax-tire", "xmax-battery"];
  const records = keys.map((key) => ({ topicKey: key, originalTopicKey: key, state: "HOLD_CONTENT", history: [{ state: "HOLD_CONTENT", reason: "CRITICAL_CLAIM_UNVERIFIED" }] }));
  const rows = keys.map((topic_key) => ({ topic_key, status: "BLOCKED", attempt_count: 1 }));
  const audit = auditHoldResume(records, rows);
  assert.equal(audit.length, 8);
  assert.equal(audit.filter((item) => item.retryable).length, 8);
  assert.equal(audit.filter((item) => item.terminal).length, 0);
  assert.equal(audit.filter((item) => item.invalidState).length, 0);
  assert.equal(audit.every((item) => item.resumeStage === "RESEARCH" && item.artifactReuse === "CANDIDATE"), true);
});
