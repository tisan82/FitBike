import assert from "node:assert/strict";
import test from "node:test";
import { selectImageSource } from "./image-source-policy.mjs";

test("TIRE thumbnail uses MAXXIS first", () => assert.equal(selectImageSource({ partType: "TIRE", role: "thumbnail", imageRole: "PRODUCT_REPRESENTATION", brandAssetAvailable: true, sourceAsset: "tire-models/maxxis/X/main.webp" }).sourceType, "APPROVED_BRAND_ASSET"));
test("BATTERY thumbnail uses POWEROAD first", () => assert.equal(selectImageSource({ partType: "BATTERY", role: "thumbnail", imageRole: "PRODUCT_REPRESENTATION", brandAssetAvailable: true, sourceAsset: "poweroad/main.webp" }).sourceType, "APPROVED_BRAND_ASSET"));
test("TIRE educational body may be generated", () => assert.equal(selectImageSource({ partType: "TIRE", role: "body", imageRole: "EDUCATIONAL_DIAGRAM", brandAssetAvailable: true }).sourceType, "GENERATED_EDUCATIONAL"));
test("BATTERY educational body may be generated", () => assert.equal(selectImageSource({ partType: "BATTERY", role: "body", imageRole: "EDUCATIONAL_DIAGRAM", brandAssetAvailable: true }).sourceType, "GENERATED_EDUCATIONAL"));
test("generic tire product thumbnail is blocked when MAXXIS exists", () => assert.equal(selectImageSource({ partType: "TIRE", role: "thumbnail", imageRole: "PRODUCT_REPRESENTATION", brandAssetAvailable: true, brandAssetSuitable: false }).status, "FAIL"));
test("generic battery product thumbnail is blocked when POWEROAD exists", () => assert.equal(selectImageSource({ partType: "BATTERY", role: "thumbnail", imageRole: "PRODUCT_REPRESENTATION", brandAssetAvailable: true, brandAssetSuitable: false }).status, "FAIL"));
test("licensed web real-world asset is accepted for editorial editing", () => {
  const result = selectImageSource({ partType: "BATTERY", role: "body", imageRole: "ACCESS_POINT", brandAssetAvailable: false, webAsset: { sourceUrl: "https://example.com/photo.jpg", creator: "Example Creator", rightsStatus: "CC_BY", rightsEvidence: "https://example.com/license", editPlan: "crop, exposure correction, and a non-obscuring callout" } });
  assert.equal(result.status, "PASS");
  assert.equal(result.sourceType, "WEB_REAL_ASSET_EDIT");
});
test("web source without license metadata is accepted with provenance", () => {
  const result = selectImageSource({ partType: "BATTERY", role: "body", imageRole: "PROCEDURE", brandAssetAvailable: false, webAsset: { sourceUrl: "https://blog.example/photo.jpg", creator: "Blog Owner", editPlan: "crop" } });
  assert.equal(result.status, "PASS");
  assert.equal(Object.hasOwn(result, "rightsStatus"), false);
});

test("web source without provenance is rejected", () => {
  assert.equal(selectImageSource({webAsset:{sourceUrl:"https://example.com/image.jpg"}}).status,"FAIL");
});
