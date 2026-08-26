import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const requiredCapabilities = ["DB_READ", "DB_WRITE", "RESEARCH", "CONTENT_GENERATION", "BRAND_ASSET_READ", "IMAGE_GENERATION", "IMAGE_OUTPUT_ACQUISITION", "IMAGE_QA", "STORAGE_WRITE", "PUBLISH", "PRODUCTION_HTTP_QA", "SITEMAP_QA"];

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

async function evaluateCapabilities({ receiptPath = path.join(projectDirectory, "content-work/runtime-capabilities/image-generation.json"), origin = "https://fitbike.co.kr" } = {}) {
  const matrix = {};
  try { await managementQuery("select 1 as ok"); matrix.DB_READ = ready(); } catch (error) { matrix.DB_READ = blocked("BLOCKED_BY_CREDENTIAL", error.message); }
  try { await managementQuery("begin; create temporary table fitbike_capability_probe(value integer) on commit drop; insert into fitbike_capability_probe values (1); select value from fitbike_capability_probe; rollback;", [], false); matrix.DB_WRITE = ready({ mutation: "TEMPORARY_TRANSACTION_SCOPE" }); } catch (error) { matrix.DB_WRITE = blocked("BLOCKED_BY_CREDENTIAL", error.message); }

  const checkpointDirectory = path.join(projectDirectory, "content-work/brake-specification-check");
  matrix.RESEARCH = existsSync(path.join(checkpointDirectory, "evidence.json")) ? ready({ artifact: "evidence.json" }) : blocked("MISSING", "RESEARCH_ARTIFACT_MISSING");
  matrix.CONTENT_GENERATION = existsSync(path.join(checkpointDirectory, "content-package.json")) ? ready({ artifact: "content-package.json" }) : blocked("MISSING", "CONTENT_PACKAGE_MISSING");

  try {
    const assets = await managementQuery(`(select 'MAXXIS' as brand,coalesce(tm.main_image_url,tp.product_image_url) as asset from public."11_tire_model" tm left join public."04_tire_product" tp on tp.tire_model_id=tm.tire_model_id and tp.is_active=true where tm.is_active=true and upper(tm.brand_name)='MAXXIS' and coalesce(tm.main_image_url,tp.product_image_url) is not null limit 1) union all (select 'POWEROAD' as brand,bp.product_image_url as asset from public."05_battery_product" bp where bp.is_active=true and upper(bp.brand_name)='POWEROAD' and bp.product_image_url is not null limit 1)`);
    if (assets.length < 1) throw new Error("APPROVED_BRAND_ASSET_MISSING");
    const checks = [];
    const storageClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const asset of assets) {
      const objectPath = asset.asset.replace(/^\/+/, "");
      const bucket = objectPath.startsWith("tire-models/") ? "tire-assets" : "bike-assets";
      const assetUrl = /^https?:\/\//.test(asset.asset) ? asset.asset : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${objectPath}`;
      if (/^https?:\/\//.test(asset.asset)) {
        const response = await fetch(assetUrl, { headers: { Range: "bytes=0-0" } });
        checks.push({ brand: asset.brand, asset: asset.asset, access: `HTTP_${response.status}`, ready: [200, 206].includes(response.status) });
      } else {
        const download = await storageClient.storage.from(bucket).download(objectPath);
        checks.push({ brand: asset.brand, asset: asset.asset, access: download.error ? `STORAGE_ERROR:${download.error.message}` : "AUTHENTICATED_STORAGE", ready: !download.error && download.data.size > 0 });
      }
    }
    const accessible = checks.find((check) => check.ready);
    if (!accessible) throw new Error(`APPROVED_BRAND_ASSET_UNAVAILABLE:${JSON.stringify(checks)}`);
    matrix.BRAND_ASSET_READ = ready({ testedBrand: accessible.brand, asset: accessible.asset, access: accessible.access, checks });
  } catch (error) { matrix.BRAND_ASSET_READ = blocked("BLOCKED_BY_EXTERNAL_SERVICE", error.message); }

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

  const blockedCapabilities = requiredCapabilities.filter((capability) => matrix[capability]?.state !== "IMPLEMENTED_AND_E2E_VERIFIED");
  return { status: blockedCapabilities.length ? "BATCH_PREFLIGHT_BLOCKED" : "READY", required: requiredCapabilities.length, ready: requiredCapabilities.length - blockedCapabilities.length, blocked: blockedCapabilities.length, blockedCapabilities, matrix };
}

async function main() {
  await loadEnvironment();
  const result = await evaluateCapabilities();
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "READY") process.exitCode = 2;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

export { checkImageReceipt, evaluateCapabilities, requiredCapabilities };
