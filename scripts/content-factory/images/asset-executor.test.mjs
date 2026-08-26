import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { executeAssets, validateVisualQa } from "./asset-executor.mjs";

const packageFixture = { contentKey: "asset-test", relations: { parts: [{ partType: "TIRE" }], bikeModels: [{ bikeModelId: 7 }] } };
const passingQa = (assetId, sourceType) => ({ assetId, sourceType, subjectMatch: true, roleMatch: true, brandAssetFirst: true, productModelMatch: true, technicalMisrepresentation: false, unsupportedNumericClaim: false, unsafeVisual: false, mobileReadability: true, assetAvailability: true, storageReadiness: true });

async function withDirectory(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fitbike-assets-"));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

async function fakeNormalizer(contentDirectory) {
  const imageResult = { status: "READY_FOR_VISUAL_REVIEW", assets: [{ id: "thumbnail", type: "thumbnail", file: "thumbnail.webp", status: "PASS" }], issues: [] };
  await writeFile(path.join(contentDirectory, "image-result.json"), JSON.stringify(imageResult));
  await writeFile(path.join(contentDirectory, "content-package-with-images.json"), JSON.stringify({ ...packageFixture, imageCandidates: imageResult }));
  return imageResult;
}

async function writeQaOnDownload(url, output) {
  await writeFile(output, "fixture");
  await writeFile(path.join(path.dirname(output), "thumbnail.qa.json"), JSON.stringify(passingQa("thumbnail", "APPROVED_BRAND_ASSET")));
}

test("MAXXIS 승인 Asset을 실제 관계 조회 결과로 선택한다", async () => withDirectory(async (directory) => {
  const request = { status: "READY_FOR_IMAGE_GENERATION", assets: [{ id: "thumbnail", sourceArgument: "thumbnail-source", sourceSelection: { sourceType: "APPROVED_BRAND_ASSET", role: "PRODUCT_REPRESENTATION" } }] };
  const result = await executeAssets({ contentDirectory: directory, request, contentPackage: packageFixture, brandResolver: async () => ({ relationVerified: true, brand_name: "MAXXIS", source_asset: "tire-models/maxxis/test/main.webp", url: "https://example.invalid/main.webp", bucket: "tire-assets", objectPath: "tire-models/maxxis/test/main.webp" }), downloader: writeQaOnDownload, imageNormalizer: fakeNormalizer });
  assert.equal(result.status, "PASS");
  assert.equal(result.assets[0].brand, "MAXXIS");
}));

test("POWEROAD 승인 Asset을 실제 관계 조회 결과로 선택한다", async () => withDirectory(async (directory) => {
  const request = { status: "READY_FOR_IMAGE_GENERATION", assets: [{ id: "thumbnail", sourceArgument: "thumbnail-source", sourceSelection: { sourceType: "APPROVED_BRAND_ASSET", role: "PRODUCT_REPRESENTATION" } }] };
  const batteryPackage = { ...packageFixture, relations: { parts: [{ partType: "BATTERY" }], bikeModels: [{ bikeModelId: 8 }] } };
  const result = await executeAssets({ contentDirectory: directory, request, contentPackage: batteryPackage, brandResolver: async () => ({ relationVerified: true, brand_name: "POWEROAD", source_asset: "battery-products/poweroad/test/main.webp", url: "https://example.invalid/main.webp", bucket: "bike-assets", objectPath: "battery-products/poweroad/test/main.webp" }), downloader: writeQaOnDownload, imageNormalizer: fakeNormalizer });
  assert.equal(result.assets[0].brand, "POWEROAD");
}));

test("Educational 출력이 없으면 BLOCKED_SYSTEM으로 handoff한다", async () => withDirectory(async (directory) => {
  const request = { status: "READY_FOR_IMAGE_GENERATION", contentKey: "edu", assets: [{ id: "thumbnail", prompt: "안전한 교육 이미지", sourceArgument: "thumbnail-source", sourceSelection: { sourceType: "GENERATED_EDUCATIONAL", role: "EDUCATIONAL_DIAGRAM" } }] };
  const result = await executeAssets({ contentDirectory: directory, request, contentPackage: packageFixture });
  assert.equal(result.status, "BLOCKED_SYSTEM");
  assert.equal(JSON.parse(await readFile(path.join(directory, "image-execution-request.json"), "utf8")).assets[0].qaSidecar, "thumbnail.qa.json");
}));

test("Educational 출력과 QA가 있으면 실행을 완료한다", async () => withDirectory(async (directory) => {
  const sourceDirectory = path.join(directory, "image-sources");
  await mkdir(sourceDirectory);
  await writeFile(path.join(sourceDirectory, "thumbnail.png"), "fixture");
  await writeFile(path.join(sourceDirectory, "thumbnail.qa.json"), JSON.stringify(passingQa("thumbnail", "GENERATED_EDUCATIONAL")));
  const request = { status: "READY_FOR_IMAGE_GENERATION", assets: [{ id: "thumbnail", prompt: "교육", sourceArgument: "thumbnail-source", sourceSelection: { sourceType: "GENERATED_EDUCATIONAL", role: "EDUCATIONAL_DIAGRAM" } }] };
  const result = await executeAssets({ contentDirectory: directory, request, contentPackage: packageFixture, imageNormalizer: fakeNormalizer });
  assert.equal(result.status, "PASS");
  assert.equal(result.assets[0].sourceType, "GENERATED_EDUCATIONAL");
}));

test("MIXED는 Brand Asset과 Educational Asset을 각각 실행한다", async () => withDirectory(async (directory) => {
  const sourceDirectory = path.join(directory, "image-sources");
  await mkdir(sourceDirectory);
  await writeFile(path.join(sourceDirectory, "body-01.png"), "fixture");
  await writeFile(path.join(sourceDirectory, "body-01.qa.json"), JSON.stringify(passingQa("body-01", "GENERATED_EDUCATIONAL")));
  const request = { status: "READY_FOR_IMAGE_GENERATION", assets: [
    { id: "thumbnail", sourceArgument: "thumbnail-source", sourceSelection: { sourceType: "APPROVED_BRAND_ASSET", role: "PRODUCT_REPRESENTATION" } },
    { id: "body-01", prompt: "교육", sourceArgument: "body-01-source", sourceSelection: { sourceType: "GENERATED_EDUCATIONAL", role: "EDUCATIONAL_DIAGRAM" } }
  ] };
  const result = await executeAssets({ contentDirectory: directory, request, contentPackage: packageFixture, brandResolver: async () => ({ relationVerified: true, brand_name: "MAXXIS", source_asset: "tire-models/maxxis/test/main.webp", url: "https://example.invalid/main.webp", bucket: "tire-assets", objectPath: "tire-models/maxxis/test/main.webp" }), downloader: writeQaOnDownload, imageNormalizer: fakeNormalizer });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.assets.map((asset) => asset.sourceType), ["APPROVED_BRAND_ASSET", "GENERATED_EDUCATIONAL"]);
}));

test("제품/모델 관계 불일치는 HOLD_CONTENT다", async () => withDirectory(async (directory) => {
  const request = { status: "READY_FOR_IMAGE_GENERATION", assets: [{ id: "thumbnail", sourceArgument: "thumbnail-source", sourceSelection: { sourceType: "APPROVED_BRAND_ASSET", role: "PRODUCT_REPRESENTATION" } }] };
  const result = await executeAssets({ contentDirectory: directory, request, contentPackage: packageFixture, brandResolver: async () => null });
  assert.deepEqual(result, { status: "HOLD_CONTENT", reason: "ASSET_DATA_ISSUE", asset: "thumbnail" });
}));

test("NO_VISUAL은 Image QA를 빈 Asset PASS로 완료한다", async () => withDirectory(async (directory) => {
  const result = await executeAssets({ contentDirectory: directory, request: { status: "NO_IMAGES_REQUIRED", assets: [] }, contentPackage: packageFixture });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.assets, []);
}));

test("Image QA는 안전·수치·모바일·Storage 항목을 모두 강제한다", () => {
  const qa = passingQa("thumbnail", "GENERATED_EDUCATIONAL");
  assert.equal(validateVisualQa(qa, { id: "thumbnail" }, "GENERATED_EDUCATIONAL").pass, true);
  assert.deepEqual(validateVisualQa({ ...qa, unsafeVisual: true, storageReadiness: false }, { id: "thumbnail" }, "GENERATED_EDUCATIONAL").failures, ["unsafeVisual", "storageReadiness"]);
});
