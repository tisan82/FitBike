import assert from "node:assert/strict";
import test from "node:test";

import { classifyDuplicate, normalizeIntent, subjectRelationship } from "./generate-content.mjs";

function intent(title, contentType, part = "TIRE") {
  return normalizeIntent({ title, contentType, targetPart: part });
}

function existing(contentKey, title, contentType, part = "TIRE", summary = "", bodyBlocks = []) {
  return { content_key: contentKey, title, summary, content_type: contentType, part_types: [part], model_keys: [], body_blocks: bodyBlocks };
}

test("classifies subject relationships without collapsing a part", () => {
  assert.equal(subjectRelationship("TIRE_POSITION", "TIRE_SIZE", "TIRE"), "RELATED");
  assert.equal(subjectRelationship("TIRE", "TIRE_SIZE", "TIRE"), "PARENT_CHILD");
});

test("TIRE_POSITION and TIRE_SIZE are distinct", () => {
  const result = classifyDuplicate(intent("오토바이 타이어 앞·뒤 구분 방법", "PARTS_GUIDE"), "motorcycle-tire", "오토바이 타이어 앞·뒤 구분 방법", [existing("tire-size-guide", "타이어 규격 읽는 법", "PARTS_GUIDE", "TIRE", "폭, 편평비와 하중지수를 설명합니다.")]);
  assert.equal(result.status, "DISTINCT_CONTENT");
});

test("TIRE_PRESSURE and TIRE_WEAR are distinct", () => {
  const result = classifyDuplicate(intent("오토바이 타이어 공기압 확인 방법", "MAINTENANCE"), "tire-pressure-check", "오토바이 타이어 공기압 확인 방법", [existing("tire-wear-check", "오토바이 타이어 마모 확인 방법", "MAINTENANCE")]);
  assert.equal(result.status, "DISTINCT_CONTENT");
});

test("TIRE_CRACK and TIRE_WEAR are distinct", () => {
  const result = classifyDuplicate(intent("오토바이 타이어 균열 확인 방법", "MAINTENANCE"), "tire-crack-check", "오토바이 타이어 균열 확인 방법", [existing("tire-wear-check", "오토바이 타이어 마모 확인 방법", "MAINTENANCE")]);
  assert.equal(result.status, "DISTINCT_CONTENT");
});

test("same battery replacement intent remains an exact duplicate", () => {
  const request = intent("오토바이 배터리 교체 전 확인할 것", "MAINTENANCE", "BATTERY");
  const result = classifyDuplicate(request, "motorcycle-battery-pre-replacement-check", "오토바이 배터리 교체 전 확인할 것", [existing("battery-check-before-replace", "배터리 교체 전 확인할 것", "MAINTENANCE", "BATTERY")]);
  assert.equal(result.status, "EXACT_DUPLICATE");
});

test("TIRE_LOAD_INDEX remains distinct from the broader size guide", () => {
  const result = classifyDuplicate(intent("타이어 하중지수 읽는 법", "PARTS_GUIDE"), "tire-load-index-guide", "타이어 하중지수 읽는 법", [existing("tire-size-guide", "타이어 규격 읽는 법", "PARTS_GUIDE", "TIRE", "폭, 편평비, 휠 크기와 하중지수의 의미를 확인합니다.", [{ type: "table", rows: [["58", "하중지수"]] }])]);
  assert.equal(result.status, "DISTINCT_CONTENT");
});
