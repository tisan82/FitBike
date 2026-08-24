import assert from "node:assert/strict";
import test from "node:test";
import { selectImageSource } from "./image-source-policy.mjs";

test("TIRE thumbnail uses MAXXIS first", () => assert.equal(selectImageSource({ partType: "TIRE", role: "thumbnail", imageRole: "PRODUCT_REPRESENTATION", brandAssetAvailable: true, sourceAsset: "tire-models/maxxis/X/main.webp" }).sourceType, "APPROVED_BRAND_ASSET"));
test("BATTERY thumbnail uses POWEROAD first", () => assert.equal(selectImageSource({ partType: "BATTERY", role: "thumbnail", imageRole: "PRODUCT_REPRESENTATION", brandAssetAvailable: true, sourceAsset: "poweroad/main.webp" }).sourceType, "APPROVED_BRAND_ASSET"));
test("TIRE educational body may be generated", () => assert.equal(selectImageSource({ partType: "TIRE", role: "body", imageRole: "EDUCATIONAL_DIAGRAM", brandAssetAvailable: true }).sourceType, "GENERATED_EDUCATIONAL"));
test("BATTERY educational body may be generated", () => assert.equal(selectImageSource({ partType: "BATTERY", role: "body", imageRole: "EDUCATIONAL_DIAGRAM", brandAssetAvailable: true }).sourceType, "GENERATED_EDUCATIONAL"));
test("generic tire product thumbnail is blocked when MAXXIS exists", () => assert.equal(selectImageSource({ partType: "TIRE", role: "thumbnail", imageRole: "PRODUCT_REPRESENTATION", brandAssetAvailable: true, brandAssetSuitable: false }).status, "FAIL"));
test("generic battery product thumbnail is blocked when POWEROAD exists", () => assert.equal(selectImageSource({ partType: "BATTERY", role: "thumbnail", imageRole: "PRODUCT_REPRESENTATION", brandAssetAvailable: true, brandAssetSuitable: false }).status, "FAIL"));
