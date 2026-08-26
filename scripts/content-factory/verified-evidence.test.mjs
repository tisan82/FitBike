import assert from "node:assert/strict";
import test from "node:test";
import { detectClaimConflicts, resolveFitBikeEvidence } from "./verified-evidence.mjs";

const model = { bike_model_id: 1, model_key: "TEST_MODEL", model_name_en: "Test", model_name_ko: "테스트", brand_key: "TEST", brand_en: "Test", brand_ko: "테스트" };
const year = { bike_model_year_id: 10, year_range_label: "2024-2026", start_year: 2024, end_year: 2026, generation_name: "1세대", front_tire_full_size: "110/70-13", front_tire_tube_type: "TL", rear_tire_full_size: "130/70-13", rear_tire_tube_type: "TL", battery_standard_code: "YTZ8V", battery_voltage: "12V" };
function reader({ years = [year], tire = [], battery = [], brake = [] } = {}) { return async (query) => query.includes('"02_bike_model"') && query.includes('"01_brand"') ? [model] : query.includes('from public."03_bike_model_year" where') ? years : query.includes('"07_bike_model_year_tire_product"') ? tire : query.includes('"08_battery_standard_product"') ? battery : query.includes('"09_bike_model_year_brake_product"') ? brake : []; }

test("FitBike 구조화 Tire Evidence를 VERIFIED Claim Matrix로 만든다", async () => {
  const result = await resolveFitBikeEvidence({ readEvidence: reader(), modelKey: model.model_key, partType: "TIRE" });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.coverage.factGate, "PASS");
  assert.ok(result.claims.every((item) => item.source_type === "FITBIKE_VERIFIED_DATA"));
});
test("연식별 Tire 규격 누락을 단일 값으로 일반화하지 않는다", async () => {
  const result = await resolveFitBikeEvidence({ readEvidence: reader({ years: [year, { ...year, bike_model_year_id: 11, year_range_label: "2027-", rear_tire_full_size: null }] }), modelKey: model.model_key, partType: "TIRE" });
  assert.equal(result.status, "UNVERIFIED");
  assert.ok(result.missing.includes("2027-: rear_tire_size"));
});
test("DB Evidence가 없으면 VERIFIED 처리하지 않는다", async () => {
  const result = await resolveFitBikeEvidence({ readEvidence: reader({ years: [] }), modelKey: model.model_key, partType: "TIRE" });
  assert.equal(result.status, "UNVERIFIED");
});
test("Battery Standard와 실제 Product Mapping을 Evidence로 사용한다", async () => {
  const result = await resolveFitBikeEvidence({ readEvidence: reader({ battery: [{ year_range_label: year.year_range_label, battery_standard_code: "YTZ8V", battery_part_key: "POWEROAD_TEST", voltage: "12V" }] }), modelKey: model.model_key, partType: "BATTERY" });
  assert.equal(result.status, "VERIFIED");
  assert.ok(result.claims.some((item) => item.name === "compatible_battery"));
});
test("Brake Relation이 없으면 Candidate Evidence를 HOLD한다", async () => {
  const result = await resolveFitBikeEvidence({ readEvidence: reader(), modelKey: model.model_key, partType: "BRAKE" });
  assert.equal(result.status, "UNVERIFIED");
  assert.match(result.missing[0], /brake product relation/);
});
test("Brake Relation이 있으면 위치별 Claim을 VERIFIED 처리한다", async () => {
  const result = await resolveFitBikeEvidence({ readEvidence: reader({ brake: [{ year_range_label: year.year_range_label, position_type: "FRONT", brake_product_key: "BRAKE_TEST" }] }), modelKey: model.model_key, partType: "BRAKE" });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.claims[0].name, "front_compatible_brake");
});
test("Model Identity는 Brand·Model·Generation·Year Range를 분리한다", async () => { const result = await resolveFitBikeEvidence({ readEvidence: reader(), modelKey: model.model_key, partType: "TIRE" }); assert.deepEqual(result.identity.yearRanges, ["2024-2026"]); assert.deepEqual(result.identity.generations, ["1세대"]); });
test("동일 연식 Critical Claim 충돌은 SOURCE_CONFLICT로 검출한다", () => { const conflicts = detectClaimConflicts([{ name: "front_tire_size", value: "A", year_range: "2024" }, { name: "front_tire_size", value: "B", year_range: "2024" }]); assert.equal(conflicts[0].reason, "SOURCE_CONFLICT"); });
