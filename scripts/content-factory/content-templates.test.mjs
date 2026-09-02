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

test("HOW_TO requires realistic access and stop conditions", () => {
  const rule = { minBlocks: 1, maxBlocks: 20, requiredBlockTypes: ["step", "table", "warning"], requiredRealitySignals: ["ACCESS_SCOPE", "MODEL_VARIANCE", "WORKSPACE_CONSTRAINT", "STOP_CONDITION", "COMPLETION_CHECK"] };
  const blocks = [
    { type: "table", rows: [["시트와 커버 분리 범위", "차종과 연식별 위치가 다름"]] },
    { type: "step", body: "좁은 작업 공간에서 배선 간섭을 확인합니다." },
    { type: "paragraph", text: "완료 확인 후 커버를 복구하고 연결부가 흔들리지 않는지 봅니다." },
    { type: "warning", body: "분리 순서를 확인할 수 없으면 작업을 중단하고 전문 점검을 확인합니다." }
  ];
  assert.deepEqual(validateTemplateContent({ template: "HOW_TO", blocks, rule }), []);
});

test("HOW_TO blocks procedure-only drafts without reality context", () => {
  const rule = { minBlocks: 1, maxBlocks: 20, requiredBlockTypes: ["step"], requiredRealitySignals: ["ACCESS_SCOPE", "STOP_CONDITION"] };
  const failures = validateTemplateContent({ template: "HOW_TO", blocks: [{ type: "step", body: "부품을 교체합니다." }], rule });
  assert.ok(failures.includes("TEMPLATE_REALITY_SIGNAL:ACCESS_SCOPE"));
  assert.ok(failures.includes("TEMPLATE_REALITY_SIGNAL:STOP_CONDITION"));
});
