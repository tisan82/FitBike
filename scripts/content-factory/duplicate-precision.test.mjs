import assert from "node:assert/strict";
import test from "node:test";

import { classifyDuplicate, classifyPostGenerationDuplicate, normalizeIntent, preGenerationDecision, subjectRelationship } from "./generate-content.mjs";

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

test("pre-generation flow stops exact and continues near or distinct", () => {
  assert.equal(preGenerationDecision("EXACT_DUPLICATE"), "STOP");
  assert.equal(preGenerationDecision("NEAR_DUPLICATE"), "CONTINUE");
  assert.equal(preGenerationDecision("DISTINCT_CONTENT"), "CONTINUE");
});

test("post-generation flow reviews substantial same-subject duplication", () => {
  const request = intent("오토바이 타이어 마모 확인 방법", "MAINTENANCE");
  const blocks = [{ type: "paragraph", text: "타이어 마모 상태를 여러 위치에서 확인하고 이상 마모는 전문 점검합니다." }, { type: "paragraph", text: "트레드와 접지면의 마모를 확인합니다." }];
  const result = classifyPostGenerationDuplicate(request, { title: "오토바이 타이어 마모 확인 방법", summary: "타이어 마모 상태를 확인합니다.", blocks }, [existing("tire-wear-guide", "타이어 마모 확인 방법", "MAINTENANCE", "TIRE", "타이어 마모 상태를 확인합니다.", blocks)]);
  assert.equal(result.status, "CONTENT_DUPLICATE");
});

test("post-generation flow continues distinct subject coverage", () => {
  const request = intent("오토바이 타이어 앞·뒤 구분 방법", "PARTS_GUIDE");
  const result = classifyPostGenerationDuplicate(request, { title: "오토바이 타이어 앞·뒤 구분 방법", summary: "앞·뒤 장착 위치를 구분합니다.", blocks: [{ type: "paragraph", text: "FRONT와 REAR 표기를 확인합니다." }] }, [existing("tire-size-guide", "타이어 규격 읽는 법", "PARTS_GUIDE", "TIRE", "폭과 편평비를 설명합니다.", [{ type: "table", rows: [["120", "타이어 폭"]] }])]);
  assert.equal(result.status, "CONTENT_DISTINCT");
});

test("post-generation flow catches body duplication despite a different declared subject", () => {
  const request = intent("오토바이 타이어 앞·뒤 구분 방법", "PARTS_GUIDE");
  const sizeBlocks = [{ type: "heading", text: "타이어 규격과 표기" }, { type: "paragraph", text: "표기의 구성과 순서를 확인하고 크기 구조 적용 조건을 구분합니다." }];
  const result = classifyPostGenerationDuplicate(request, { title: "오토바이 타이어 앞·뒤 구분 방법", summary: "타이어 규격과 표기를 이해합니다.", blocks: sizeBlocks }, [existing("tire-size-guide", "타이어 규격 읽는 법", "PARTS_GUIDE", "TIRE", "타이어 규격과 표기를 이해합니다.", sizeBlocks)]);
  assert.equal(result.status, "CONTENT_DUPLICATE");
});
