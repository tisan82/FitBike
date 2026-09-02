import assert from "node:assert/strict";
import test from "node:test";
import { selectContentTemplate, validateTemplateContent } from "./content-templates.mjs";

test("selects templates from user purpose", () => {
  assert.equal(selectContentTemplate({ topic: "내 바이크 엔진오일 점도와 등급 확인", contentType: "PARTS_GUIDE" }), "SPEC");
  assert.equal(selectContentTemplate({ topic: "배터리 직접 교체하는 방법", contentType: "DIY" }), "HOW_TO");
  assert.equal(selectContentTemplate({ topic: "C 600 타이어 규격", contentType: "MODEL_GUIDE" }), "MODEL_DATA");
  assert.equal(selectContentTemplate({ topic: "브레이크 패드는 언제 교체해야 할까?", contentType: "MAINTENANCE" }), "CHECK");
});

test("explicit template overrides inference", () => {
  assert.equal(selectContentTemplate({ topic: "배터리", contentType: "PARTS_GUIDE", explicitTemplate: "troubleshoot" }), "TROUBLESHOOT");
});

test("validates required structure and length", () => {
  const rule = { minBlocks: 2, maxBlocks: 3, requiredBlockTypes: ["table"] };
  assert.deepEqual(validateTemplateContent({ template: "SPEC", blocks: [{ type: "paragraph" }, { type: "table" }], rule }), []);
  assert.ok(validateTemplateContent({ template: "SPEC", blocks: [{ type: "paragraph" }], rule }).length === 2);
});
