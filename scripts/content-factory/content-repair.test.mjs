import assert from "node:assert/strict";
import test from "node:test";
import { repairContent, unsupportedNumericClaims } from "./content-repair.mjs";

const headings = ["준비", "확인", "비교", "판단"];
const fixture = ({ issues = ["Sentence fragments detected (2)", "Information density is TOO_LIGHT"], numeric = false } = {}) => ({
  contentPackage: { content: { bodyBlocks: headings.flatMap((text, index) => [{ type: "heading", level: 2, text }, { type: "paragraph", text: index < 2 ? "확인 가능한 항목을 살펴보는지" : `확인 가능한 정보와 공식 안내를 구분하여 상태를 판단하는 방법을 설명합니다.${numeric ? " 99 PSI" : ""}` }]) } },
  evidence: { status: "NOT_REQUIRED", facts: [] },
  qa: { status: "REVIEW_REQUIRED", checks: { sentenceFragments: 2, informationDensity: "TOO_LIGHT", unsupportedClaims: 0, subjectDrift: true }, issues }
});

test("Sentence Fragment를 완결한 뒤 Re-QA한다", () => { const result = repairContent(fixture()); assert.equal(result.status, "PASS"); assert.equal(result.qa.checks.sentenceFragments, 0); });
test("TOO_LIGHT를 Evidence 범위의 확인 절차로 보강한다", () => { const result = repairContent(fixture()); assert.equal(result.qa.checks.informationDensity, "GOOD"); assert.equal(result.qa.repair.evidenceOnly, true); });
test("Repair Retry Limit을 기록한다", () => { const input = fixture(); input.contentPackage.content.bodyBlocks = [{ type: "heading", level: 2, text: "하나" }]; const result = repairContent({ ...input, retryLimit: 1 }); assert.equal(result.status, "HOLD_CONTENT"); assert.equal(result.attempts, 1); });
test("Fact Conflict는 Auto Repair하지 않는다", () => { const result = repairContent(fixture({ issues: ["Fact Conflict"] })); assert.equal(result.status, "NOT_AUTO_REPAIRABLE"); });
test("Repair 중 새로운 Unsupported Numeric Fact를 허용하지 않는다", () => { const original = [{ type: "paragraph", text: "기존 확인 문장입니다." }]; const added = [...original, { type: "paragraph", text: "99 PSI를 적용합니다." }]; assert.deepEqual(unsupportedNumericClaims(added, { facts: [] }, original), ["99 PSI"]); });
