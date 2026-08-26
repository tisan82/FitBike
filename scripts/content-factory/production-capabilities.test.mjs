import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkImageReceipt, requiredCapabilities } from "./production-capabilities.mjs";

test("Production Preflight 필수 Capability는 12개다", () => {
  assert.deepEqual(requiredCapabilities, ["DB_READ", "DB_WRITE", "RESEARCH", "CONTENT_GENERATION", "BRAND_ASSET_READ", "IMAGE_GENERATION", "IMAGE_OUTPUT_ACQUISITION", "IMAGE_QA", "STORAGE_WRITE", "PUBLISH", "PRODUCTION_HTTP_QA", "SITEMAP_QA"]);
});

test("실제 출력과 QA가 있는 최신 Image Runtime Receipt는 E2E 검증 상태다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fitbike-capability-"));
  try {
    const output = path.join(directory, "thumbnail.png");
    const qa = path.join(directory, "thumbnail.qa.json");
    const receipt = path.join(directory, "receipt.json");
    await writeFile(output, "image");
    await writeFile(qa, JSON.stringify({ assetAvailability: true, storageReadiness: true, unsafeVisual: false, technicalMisrepresentation: false }));
    await writeFile(receipt, JSON.stringify({ provider: "BUILT_IN_IMAGE_GEN", generatedAt: "2026-08-26T05:29:23Z", outputFile: path.relative(path.resolve("."), output), qaFile: path.relative(path.resolve("."), qa) }));
    const result = await checkImageReceipt(receipt, Date.parse("2026-08-26T06:00:00Z"));
    assert.equal(result.state, "IMPLEMENTED_AND_E2E_VERIFIED");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Image Runtime Receipt가 없으면 Adapter-only로 fail-closed한다", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fitbike-capability-"));
  try {
    const result = await checkImageReceipt(path.join(directory, "missing.json"));
    assert.deepEqual(result, { state: "ADAPTER_ONLY", reason: "IMAGE_RUNTIME_RECEIPT_MISSING" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
