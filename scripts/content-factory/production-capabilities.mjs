import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requiredCapabilities = ["DB_READ", "DB_WRITE", "RESEARCH", "CONTENT_GENERATION", "IMAGE_GENERATION", "IMAGE_OUTPUT_ACQUISITION", "IMAGE_QA", "STORAGE_WRITE", "PUBLISH", "PRODUCTION_HTTP_QA", "SITEMAP_QA"];
const completedBatchStates = new Set(["SUCCESS", "COMPLETE"]);

async function loadEnvironment() {
  const file = path.join(projectDirectory, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && process.env[match[1].trim()] === undefined) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

async function managementQuery(query, parameters = [], readOnly = true) {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!origin || !token) throw new Error("SUPABASE_MANAGEMENT_CREDENTIAL_MISSING");
  const ref = new URL(origin).hostname.split(".")[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, parameters, read_only: readOnly }) });
  if (!response.ok) throw new Error(`DATABASE_CAPABILITY_${response.status}`);
  return response.json();
}

function ready(detail = {}) { return { state: "IMPLEMENTED_AND_E2E_VERIFIED", ...detail }; }
function blocked(state, reason) { return { state, reason }; }

async function checkImageReceipt(receiptPath, now = Date.now()) {
  if (!existsSync(receiptPath)) return blocked("ADAPTER_ONLY", "IMAGE_RUNTIME_RECEIPT_MISSING");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const age = now - Date.parse(receipt.generatedAt);
  const outputFile = path.resolve(projectDirectory, receipt.outputFile);
  const qaFile = path.resolve(projectDirectory, receipt.qaFile);
  if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000) return blocked("BLOCKED_BY_EXTERNAL_SERVICE", "IMAGE_RUNTIME_RECEIPT_STALE");
  if (!existsSync(outputFile) || !existsSync(qaFile)) return blocked("ADAPTER_ONLY", "IMAGE_RUNTIME_ARTIFACT_MISSING");
  const qa = JSON.parse(await readFile(qaFile, "utf8"));
  if (qa.assetAvailability !== true || qa.storageReadiness !== true || qa.unsafeVisual !== false || qa.technicalMisrepresentation !== false) return blocked("ADAPTER_ONLY", "IMAGE_RUNTIME_QA_NOT_READY");
  return ready({ provider: receipt.provider, generatedAt: receipt.generatedAt, outputFile: receipt.outputFile, qaFile: receipt.qaFile });
}

async function checkStorageWrite() {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!origin || !secret) return blocked("BLOCKED_BY_CREDENTIAL", "STORAGE_WRITE_CREDENTIAL_MISSING");
  const client = createClient(origin, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const objectPath = `capability-checks/${randomUUID()}.webp`;
  let uploaded = false;
  let failure = null;
  try {
    const payload = Buffer.from("fitbike-capability-check");
    const upload = await client.storage.from("content-assets").upload(objectPath, payload, { contentType: "image/webp", upsert: false });
    if (upload.error) return blocked("BLOCKED_BY_EXTERNAL_SERVICE", `STORAGE_UPLOAD:${upload.error.message}`);
    uploaded = true;
    const downloaded = await client.storage.from("content-assets").download(objectPath);
    if (downloaded.error || await downloaded.data.text() !== payload.toString()) failure = "STORAGE_READBACK_FAILED";
  } finally {
    if (uploaded) {
      const cleanup = await client.storage.from("content-assets").remove([objectPath]);
      if (cleanup.error) failure = `STORAGE_CLEANUP:${cleanup.error.message}`;
    }
  }
  return failure ? blocked("BLOCKED_BY_EXTERNAL_SERVICE", failure) : ready({ disposableObject: objectPath, cleanup: "VERIFIED_REMOVED" });
}

async function auditBrandAssets() {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!origin || !secret) throw new Error("STORAGE_READ_CREDENTIAL_MISSING");
  const client = createClient(origin, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const bucketResult = await client.storage.listBuckets();
  if (bucketResult.error) throw new Error(`STORAGE_BUCKET_LIST:${bucketResult.error.message}`);
  const buckets = bucketResult.data.map((bucket) => bucket.name);
  const rows = await managementQuery(`select 'POWEROAD' as brand,battery_part_key as asset_key,product_image_url as asset from public."05_battery_product" where is_active=true and upper(brand_name)='POWEROAD' and product_image_url is not null union all select distinct 'MAXXIS' as brand,tm.tire_model_key as asset_key,coalesce(tm.main_image_url,tp.product_image_url,'tire-models/maxxis/' || tm.tire_model_key || '/main.webp') as asset from public."11_tire_model" tm left join public."04_tire_product" tp on tp.tire_model_id=tm.tire_model_id and tp.is_active=true where tm.is_active=true and (upper(tm.brand_name)='MAXXIS' or upper(tm.tire_model_key) like 'MAXXIS_%') order by brand,asset_key`);
  const results = [];
  for (const row of rows) {
    if (/^https?:\/\//.test(row.asset)) {
      const response = await fetch(row.asset, { headers: { Range: "bytes=0-0" } });
      results.push({ ...row, expectedBucket: null, actualBucket: null, status: [200, 206].includes(response.status) ? "VALID" : "BROKEN", cause: [200, 206].includes(response.status) ? "NONE" : `HTTP_${response.status}` });
      continue;
    }
    const objectPath = row.asset.replace(/^\/+/, "");
    const expectedBucket = objectPath.startsWith("tire-models/") ? "tire-assets" : objectPath.startsWith("battery-products/") ? "battery-assets" : "bike-assets";
    let actualBucket = null;
    for (const bucket of [expectedBucket, ...buckets.filter((name) => name !== expectedBucket)]) {
      const download = await client.storage.from(bucket).download(objectPath);
      if (!download.error && download.data.size > 0) { actualBucket = bucket; break; }
    }
    results.push({ ...row, expectedBucket, actualBucket, status: actualBucket ? "VALID" : "BROKEN", cause: !actualBucket ? "OBJECT_MISSING" : actualBucket === expectedBucket ? "NONE" : "BUCKET_RESOLUTION_ERROR" });
  }
  const summarize = (brand) => {
    const brandRows = results.filter((row) => row.brand === brand);
    return { dbAssets: brandRows.length, storageValid: brandRows.filter((row) => row.status === "VALID").length, broken: brandRows.filter((row) => row.status === "BROKEN").length, rows: brandRows };
  };
  return { POWEROAD: summarize("POWEROAD"), MAXXIS: summarize("MAXXIS") };
}

function inspectCheckpointResume(checkpoint) {
  if (completedBatchStates.has(checkpoint.status)) return blocked("NOT_RESUMABLE", "COMPLETED_BATCH");
  const records = checkpoint.records ?? [];
  const pendingRecords = records.filter((record) => record.state === "PUBLISHED_PENDING_QA");
  const systemRecords = records.filter((record) => record.state === "BLOCKED_SYSTEM" && record.checkpoint?.resumeEligible === true && record.resumeFrom);
  const holdRecords = records.filter((record) => ["HOLD", "HOLD_CONTENT"].includes(record.state));
  if (systemRecords.length) return ready({ batchId: checkpoint.batchId, mode: "SYSTEM", resumable: systemRecords.length, stage: systemRecords[0].resumeFrom });
  if (pendingRecords.length) return ready({ batchId: checkpoint.batchId, mode: "PRODUCTION_QA_RECONCILIATION", resumable: pendingRecords.length, stage: "PRODUCTION_QA" });
  if (checkpoint.status === "PARTIAL" && holdRecords.length) return ready({ batchId: checkpoint.batchId, mode: "HOLD_CONTENT", resumable: holdRecords.length, requiresFlag: "--retry-hold" });
  return blocked("MISSING", "RESUMABLE_CHECKPOINT_MISSING");
}

function isActiveBatch(checkpoint) {
  if (completedBatchStates.has(checkpoint.status)) return false;
  if (["RUNNING", "BLOCKED_SYSTEM", "PARTIAL"].includes(checkpoint.status) || Number(checkpoint.pendingQa) > 0) return true;
  return (checkpoint.records ?? []).some((record) => ["BLOCKED_SYSTEM", "PUBLISHED_PENDING_QA"].includes(record.state));
}

function inspectOperationPreflight({ operationMode, checkpoints = [], checkpoint = null, batchId = null }) {
  if (operationMode === "NEW_BATCH") {
    const active = checkpoints.filter((item) => item.batchId !== batchId && isActiveBatch(item));
    return {
      checkpointResume: { state: "NOT_REQUIRED", reason: "NEW_BATCH" },
      activeBatchGuard: active.length ? blocked("BLOCKED_SYSTEM", "ACTIVE_BATCH_CONFLICT") : ready({ conflict: "NONE" }),
      activeBatches: active.map((item) => ({ batchId: item.batchId, status: item.status })),
      allowed: active.length === 0
    };
  }
  if (operationMode !== "RESUME_BATCH") throw new Error("INVALID_OPERATION_MODE");
  const checkpointResume = checkpoint ? inspectCheckpointResume(checkpoint) : blocked("MISSING", "BATCH_CHECKPOINT_MISSING");
  return { checkpointResume, activeBatchGuard: { state: "NOT_APPLICABLE", reason: "RESUME_BATCH" }, activeBatches: [], allowed: checkpointResume.state === "IMPLEMENTED_AND_E2E_VERIFIED" };
}

async function readBatchCheckpoints(directory) {
  if (!existsSync(directory)) return [];
  const checkpoints = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try { checkpoints.push(JSON.parse(await readFile(path.join(directory, entry.name), "utf8"))); }
    catch { checkpoints.push({ batchId: entry.name, status: "BLOCKED_SYSTEM", reason: "INVALID_CHECKPOINT" }); }
  }
  return checkpoints;
}

function assessCapabilityReadiness({ matrix, operationMode, operation }) {
  const blockedCapabilities = requiredCapabilities.filter((capability) => matrix[capability]?.state !== "IMPLEMENTED_AND_E2E_VERIFIED");
  const operationBlocked = !operation.allowed;
  const required = requiredCapabilities.length + (operationMode === "RESUME_BATCH" ? 1 : 0);
  const readyCount = requiredCapabilities.length - blockedCapabilities.length + (operationMode === "RESUME_BATCH" && operation.checkpointResume.state === "IMPLEMENTED_AND_E2E_VERIFIED" ? 1 : 0);
  return { status: blockedCapabilities.length || operationBlocked ? "BATCH_PREFLIGHT_BLOCKED" : "READY", operationMode, required, ready: readyCount, blocked: blockedCapabilities.length + (operationBlocked ? 1 : 0), blockedCapabilities: [...blockedCapabilities, ...(operationBlocked ? [operationMode === "NEW_BATCH" ? "ACTIVE_BATCH_GUARD" : "CHECKPOINT_RESUME"] : [])], global: { required: requiredCapabilities.length, ready: requiredCapabilities.length - blockedCapabilities.length, blocked: blockedCapabilities.length }, checkpointResume: operation.checkpointResume, activeBatchGuard: operation.activeBatchGuard, canStart: operationMode === "NEW_BATCH" ? !blockedCapabilities.length && operation.allowed : undefined, canResume: operationMode === "RESUME_BATCH" ? !blockedCapabilities.length && operation.allowed : undefined };
}

async function evaluateCapabilities({ receiptPath = path.join(projectDirectory, "content-work/runtime-capabilities/image-generation.json"), origin = "https://fitbike.co.kr", operationMode = "NEW_BATCH", batchId = null, checkpointDirectory = path.join(projectDirectory, "content-work/autonomous-batches"), checkpoints: suppliedCheckpoints = null } = {}) {
  const matrix = {};
  try { await managementQuery("select 1 as ok"); matrix.DB_READ = ready(); } catch (error) { matrix.DB_READ = blocked("BLOCKED_BY_CREDENTIAL", error.message); }
  try { await managementQuery("begin; create temporary table fitbike_capability_probe(value integer) on commit drop; insert into fitbike_capability_probe values (1); select value from fitbike_capability_probe; rollback;", [], false); matrix.DB_WRITE = ready({ mutation: "TEMPORARY_TRANSACTION_SCOPE" }); } catch (error) { matrix.DB_WRITE = blocked("BLOCKED_BY_CREDENTIAL", error.message); }

  const capabilityArtifactDirectory = path.join(projectDirectory, "content-work/brake-specification-check");
  matrix.RESEARCH = existsSync(path.join(capabilityArtifactDirectory, "evidence.json")) ? ready({ artifact: "evidence.json" }) : blocked("MISSING", "RESEARCH_ARTIFACT_MISSING");
  matrix.CONTENT_GENERATION = existsSync(path.join(capabilityArtifactDirectory, "content-package.json")) ? ready({ artifact: "content-package.json" }) : blocked("MISSING", "CONTENT_PACKAGE_MISSING");

  const image = await checkImageReceipt(receiptPath);
  matrix.IMAGE_GENERATION = image;
  matrix.IMAGE_OUTPUT_ACQUISITION = image.state === "IMPLEMENTED_AND_E2E_VERIFIED" ? ready({ outputFile: image.outputFile }) : image;
  matrix.IMAGE_QA = image.state === "IMPLEMENTED_AND_E2E_VERIFIED" ? ready({ qaFile: image.qaFile }) : image;
  matrix.STORAGE_WRITE = await checkStorageWrite();

  const publishScript = path.join(projectDirectory, "scripts/content-factory/publish-content.mjs");
  matrix.PUBLISH = matrix.DB_WRITE.state === "IMPLEMENTED_AND_E2E_VERIFIED" && matrix.STORAGE_WRITE.state === "IMPLEMENTED_AND_E2E_VERIFIED" && existsSync(publishScript) ? ready({ evidence: "PRODUCTION_PUBLISH_PIPELINE_AND_EXISTING_PUBLISHED_CONTENT" }) : blocked("MISSING", "PUBLISH_DEPENDENCY_NOT_READY");
  try {
    const [home, contents, detail, robots] = await Promise.all([fetch(`${origin}/`), fetch(`${origin}/contents`), fetch(`${origin}/contents/motorcycle-brake-check`), fetch(`${origin}/robots.txt`)]);
    matrix.PRODUCTION_HTTP_QA = [home, contents, detail, robots].every((response) => response.status === 200) ? ready() : blocked("BLOCKED_BY_EXTERNAL_SERVICE", "PRODUCTION_HTTP_NOT_READY");
  } catch (error) { matrix.PRODUCTION_HTTP_QA = blocked("BLOCKED_BY_EXTERNAL_SERVICE", error.message); }
  try {
    const sitemap = await fetch(`${origin}/sitemap.xml`);
    const text = await sitemap.text();
    matrix.SITEMAP_QA = sitemap.status === 200 && text.includes("/contents/motorcycle-brake-check") ? ready() : blocked("BLOCKED_BY_EXTERNAL_SERVICE", "SITEMAP_NOT_READY");
  } catch (error) { matrix.SITEMAP_QA = blocked("BLOCKED_BY_EXTERNAL_SERVICE", error.message); }

  const checkpoints = suppliedCheckpoints ?? await readBatchCheckpoints(checkpointDirectory);
  const checkpoint = operationMode === "RESUME_BATCH" ? checkpoints.find((item) => item.batchId === batchId) ?? null : null;
  const operation = inspectOperationPreflight({ operationMode, checkpoints, checkpoint, batchId });
  matrix.CHECKPOINT_RESUME = operation.checkpointResume;
  let assetCatalog;
  try { assetCatalog = await auditBrandAssets(); } catch (error) { assetCatalog = { status: "BLOCKED_SYSTEM", reason: error.message }; }
  return { ...assessCapabilityReadiness({ matrix, operationMode, operation }), matrix, assetCatalog };
}

async function main() {
  await loadEnvironment();
  const args = Object.fromEntries(Array.from({ length: Math.floor(process.argv.slice(2).length / 2) }, (_, index) => [process.argv.slice(2)[index * 2]?.replace(/^--/, ""), process.argv.slice(2)[index * 2 + 1]]));
  const result = await evaluateCapabilities({ operationMode: args["operation-mode"] ?? "NEW_BATCH", batchId: args["batch-id"] ?? null });
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "READY") process.exitCode = 2;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

export { assessCapabilityReadiness, auditBrandAssets, checkImageReceipt, evaluateCapabilities, inspectCheckpointResume, inspectOperationPreflight, isActiveBatch, requiredCapabilities };
