import assert from "node:assert/strict";
import test from "node:test";

import { partsGuideDraft, understandSubjectProfiles } from "./generate-content.mjs";

const subjects = ["TIRE_SIZE", "TIRE_POSITION", "TIRE_TUBE_TYPE", "TIRE_LOAD_INDEX", "TIRE_SPEED_RATING"];

for (const subject of subjects) {
  test(`${subject} UNDERSTAND keeps its primary coverage`, () => {
    const draft = partsGuideDraft("테스트 주제", "TIRE", { subject, action: "UNDERSTAND" });
    const text = JSON.stringify(draft.blocks);
    assert.ok(draft.subjectProfile === understandSubjectProfiles[subject]);
    assert.ok(draft.subjectProfile.coverage.every((pattern) => pattern.test(text)));
    assert.ok(draft.subjectProfile.adjacent.filter((pattern) => pattern.test(text)).length <= 1);
    assert.equal(draft.blocks.filter((block) => block.type === "heading").length, 5);
  });
}

test("TIRE_POSITION answers position instead of size notation", () => {
  const draft = partsGuideDraft("오토바이 타이어 앞·뒤 구분 방법", "TIRE", { subject: "TIRE_POSITION", action: "UNDERSTAND" });
  const text = JSON.stringify(draft.blocks);
  assert.match(text, /FRONT/);
  assert.match(text, /REAR/);
  assert.match(text, /장착 위치/);
  assert.doesNotMatch(text, /편평비|휠 지름|하중지수|속도등급/);
});
