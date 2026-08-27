import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import sharp from "sharp";

import { executeAssets } from "./asset-executor.mjs";
import { inspectBrandAssetVisual, runBrandAssetVisualQa } from "./brand-asset-visual-qa.mjs";

async function withImage(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fitbike-brand-qa-"));
  const sourceDirectory = path.join(directory, "image-sources");
  await mkdir(sourceDirectory);
  const sourcePath = path.join(sourceDirectory, "brand.webp");
  await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#707070" } }).composite([{ input: Buffer.from('<svg width="1200" height="900"><rect x="200" y="150" width="800" height="600" fill="#101010"/></svg>') }]).webp().toFile(sourcePath);
  try { await run({ directory, sourcePath }); } finally { await rm(directory, { recursive: true, force: true }); }
}

const asset = (id, role, brand = "MAXXIS") => ({ id, role, sourceSelection: { sourceType: "APPROVED_BRAND_ASSET", role: role === "thumbnail" ? "USAGE_ACTION" : "PRODUCT_REPRESENTATION", brand } });
const maxxis = { relationVerified: true, tire_model_key: "MAXXIS_MA_HS", brand_name: "MAXXIS", source_asset: "tire-models/maxxis/MAXXIS_MA_HS/main.webp" };
const poweroad = { relationVerified: true, battery_part_key: "POWEROAD_PLFP_7L", brand_name: "POWEROAD", source_asset: "battery-products/poweroad/POWEROAD_PLFP_7L/main.webp" };

test("MAXXIS Thumbnail Brand Asset Visual QA가 PASS한다", async () => withImage(async ({ sourcePath }) => {
  assert.equal((await inspectBrandAssetVisual({ sourcePath, asset: asset("thumbnail", "thumbnail"), resolved: maxxis, expectedBrand: "MAXXIS" })).final, "PASS");
}));

test("MAXXIS Hero Brand Asset Visual QA가 PASS한다", async () => withImage(async ({ sourcePath }) => {
  assert.equal((await inspectBrandAssetVisual({ sourcePath, asset: asset("hero", "hero"), resolved: maxxis, expectedBrand: "MAXXIS" })).role_match, "PASS");
}));

test("POWEROAD Product Asset도 공통 Visual QA 경로를 사용한다", async () => withImage(async ({ sourcePath }) => {
  assert.equal((await inspectBrandAssetVisual({ sourcePath, asset: asset("thumbnail", "thumbnail", "POWEROAD"), resolved: poweroad, expectedBrand: "POWEROAD" })).final, "PASS");
}));

test("다른 Product 관계 Asset은 HOLD_CONTENT로 분류한다", async () => withImage(async ({ sourcePath }) => {
  const result = await inspectBrandAssetVisual({ sourcePath, asset: asset("thumbnail", "thumbnail"), resolved: { ...maxxis, relationVerified: false }, expectedBrand: "MAXXIS" });
  assert.equal(result.final, "HOLD_CONTENT");
  assert.equal(result.product_identity_match, "FAIL");
}));

test("Brand Asset QA Artifact를 기존 Image QA sidecar에 저장한다", async () => withImage(async ({ directory, sourcePath }) => {
  const result = await runBrandAssetVisualQa({ contentDirectory: directory, sourcePath, asset: asset("thumbnail", "thumbnail"), resolved: maxxis, expectedBrand: "MAXXIS" });
  const artifact = JSON.parse(await readFile(path.join(directory, "image-sources", "thumbnail.qa.json"), "utf8"));
  assert.equal(result.final, "PASS");
  assert.equal(artifact.source_type, "APPROVED_BRAND_ASSET");
  assert.equal(artifact.asset_integrity, "PASS");
  assert.equal(artifact.technical_misrepresentation, "NONE");
}));

test("같은 Asset을 Thumbnail과 Hero에 사용해도 Role을 각각 판정한다", async () => withImage(async ({ sourcePath }) => {
  const results = await Promise.all(["thumbnail", "hero"].map((role) => inspectBrandAssetVisual({ sourcePath, asset: asset(role, role), resolved: maxxis, expectedBrand: "MAXXIS" })));
  assert.deepEqual(results.map((result) => result.role_match), ["PASS", "PASS"]);
}));

test("Visual QA Runtime 예외는 BLOCKED_SYSTEM으로 분류한다", async () => withImage(async ({ directory }) => {
  const request = { status: "READY_FOR_BRAND_ASSET", contentKey: "runtime-error", assets: [asset("thumbnail", "thumbnail")] };
  request.assets[0].sourceArgument = "thumbnail-source";
  const contentPackage = { relations: { parts: [{ partType: "TIRE" }], bikeModels: [{ bikeModelId: 7 }] } };
  const result = await executeAssets({ contentDirectory: directory, request, contentPackage, brandResolver: async () => ({ ...maxxis, url: "https://example.invalid/main.webp" }), downloader: async (url, output) => sharp({ create: { width: 640, height: 480, channels: 3, background: "#333" } }).webp().toFile(output), brandVisualQa: async () => { throw new Error("QA_ENGINE_DOWN"); } });
  assert.equal(result.status, "BLOCKED_SYSTEM");
  assert.equal(result.reason, "BRAND_ASSET_VISUAL_QA_RUNTIME_ERROR");
}));

test("IMAGE_QA_PENDING Brand Asset은 자동 QA Artifact 생성 후 Pipeline을 계속한다", async () => withImage(async ({ directory }) => {
  const request = { status: "READY_FOR_BRAND_ASSET", contentKey: "resume-brand", assets: [{ ...asset("thumbnail", "thumbnail"), sourceArgument: "thumbnail-source" }] };
  const contentPackage = { contentKey: "resume-brand", relations: { parts: [{ partType: "TIRE" }], bikeModels: [{ bikeModelId: 7 }] } };
  const normalizer = async (contentDirectory) => {
    const result = { status: "READY_FOR_VISUAL_REVIEW", assets: [{ id: "thumbnail", status: "PASS" }], issues: [] };
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path.join(contentDirectory, "image-result.json"), JSON.stringify(result));
    await writeFile(path.join(contentDirectory, "content-package-with-images.json"), JSON.stringify({ ...contentPackage, imageCandidates: result }));
    return result;
  };
  const result = await executeAssets({ contentDirectory: directory, request, contentPackage, brandResolver: async () => ({ ...maxxis, url: "https://example.invalid/main.webp" }), downloader: async (url, output) => sharp({ create: { width: 1200, height: 900, channels: 3, background: "#555" } }).composite([{ input: Buffer.from('<svg width="1200" height="900"><circle cx="600" cy="450" r="300" fill="#111"/></svg>') }]).webp().toFile(output), imageNormalizer: normalizer });
  assert.equal(result.status, "PASS");
  assert.equal(JSON.parse(await readFile(path.join(directory, "image-sources", "thumbnail.qa.json"), "utf8")).final, "PASS");
}));
