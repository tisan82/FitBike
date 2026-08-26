import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

const execute = promisify(execFile);
const imageDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(imageDirectory, "../../..");

function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) throw new Error("INVALID_ARGUMENTS");
    args[argv[index].slice(2)] = argv[index + 1];
  }
  return args;
}

async function loadEnvironment() {
  const file = path.join(projectDirectory, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && process.env[match[1].trim()] === undefined) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

async function managementQuery(query, parameters = []) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!url || !token) throw new Error("ASSET_REGISTRY_ACCESS_UNAVAILABLE");
  const projectRef = new URL(url).hostname.split(".")[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, parameters, read_only: true }) });
  if (!response.ok) throw new Error(`ASSET_REGISTRY_DB_ERROR:${response.status}`);
  return response.json();
}

function storageLocation(storagePath) {
  if (/^https?:\/\//.test(storagePath)) return { url: storagePath, bucket: null, objectPath: storagePath };
  const objectPath = storagePath.replace(/^\/+/, "");
  const bucket = objectPath.startsWith("tire-models/") ? "tire-assets" : objectPath.startsWith("battery-products/") ? "battery-assets" : "bike-assets";
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!origin) throw new Error("ASSET_STORAGE_ORIGIN_UNAVAILABLE");
  return { url: `${origin}/storage/v1/object/public/${bucket}/${objectPath}`, bucket, objectPath };
}

async function resolveApprovedBrandAsset({ partType, bikeModelId }) {
  let rows;
  if (partType === "TIRE") {
    rows = await managementQuery(`select tm.tire_model_key,coalesce(nullif(tm.brand_name,''),'MAXXIS') as brand_name,coalesce(tm.main_image_url,tp.product_image_url,'tire-models/maxxis/' || tm.tire_model_key || '/main.webp') as source_asset from public."11_tire_model" tm join public."04_tire_product" tp on tp.tire_model_id=tm.tire_model_id and tp.is_active=true join public."07_bike_model_year_tire_product" m on m.tire_product_id=tp.tire_product_id and m.is_active=true join public."03_bike_model_year" y on y.bike_model_year_id=m.bike_model_year_id and y.is_active=true where tm.is_active=true and (upper(tm.brand_name)='MAXXIS' or upper(tm.tire_model_key) like 'MAXXIS_%') and ($1::bigint is null or y.bike_model_id=$1) order by m.display_order,tm.tire_model_id limit 50`, [bikeModelId ?? null]);
  } else if (partType === "BATTERY") {
    rows = await managementQuery(`select bp.battery_part_key,bp.brand_name,bp.product_image_url as source_asset from public."05_battery_product" bp join public."08_battery_standard_product" m on m.battery_product_id=bp.battery_product_id and m.is_active=true join public."03_bike_model_year" y on y.battery_standard_code=m.battery_standard_code and y.is_active=true where bp.is_active=true and upper(bp.brand_name)='POWEROAD' and bp.product_image_url is not null and ($1::bigint is null or y.bike_model_id=$1) order by m.display_order,bp.battery_product_id limit 50`, [bikeModelId ?? null]);
  } else {
    return null;
  }
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!origin || !secret) throw new Error("ASSET_STORAGE_CREDENTIAL_UNAVAILABLE");
  const client = createClient(origin, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const row of rows) {
    const location = storageLocation(row.source_asset);
    if (!location.bucket) return { ...row, relationVerified: true, ...location };
    const result = await client.storage.from(location.bucket).download(location.objectPath);
    if (!result.error && result.data.size > 0) return { ...row, relationVerified: true, ...location };
  }
  return null;
}

function validateVisualQa(qa, asset, expectedSourceType) {
  const required = ["subjectMatch", "roleMatch", "brandAssetFirst", "productModelMatch", "technicalMisrepresentation", "unsupportedNumericClaim", "unsafeVisual", "mobileReadability", "assetAvailability", "storageReadiness"];
  const expected = { subjectMatch: true, roleMatch: true, brandAssetFirst: true, productModelMatch: true, technicalMisrepresentation: false, unsupportedNumericClaim: false, unsafeVisual: false, mobileReadability: true, assetAvailability: true, storageReadiness: true };
  const failures = required.filter((key) => qa?.[key] !== expected[key]);
  if (qa?.assetId !== asset.id || qa?.sourceType !== expectedSourceType) failures.push("qaIdentity");
  return { pass: failures.length === 0, failures };
}

async function downloadAsset(url, outputPath, storage = {}) {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (storage.bucket && storage.objectPath && origin && secret) {
    const client = createClient(origin, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.storage.from(storage.bucket).download(storage.objectPath);
    if (result.error) throw new Error(`ASSET_STORAGE_DOWNLOAD:${result.error.message}`);
    await writeFile(outputPath, Buffer.from(await result.data.arrayBuffer()), { flag: "wx" });
    return;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ASSET_HTTP_${response.status}`);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()), { flag: "wx" });
}

function generatedSourcePath(sourceDirectory, assetId) {
  for (const extension of ["png", "webp", "jpg", "jpeg"]) {
    const candidate = path.join(sourceDirectory, `${assetId}.${extension}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

async function normalizeImages(contentDirectory, args) {
  const { stdout } = await execute(process.execPath, [path.join(imageDirectory, "generate-images.mjs"), ...args], { cwd: projectDirectory, maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function executeAssets({ contentDirectory, request, contentPackage, brandResolver = resolveApprovedBrandAsset, downloader = downloadAsset, imageNormalizer = normalizeImages }) {
  if (request.status === "NO_IMAGES_REQUIRED") {
    const imageResult = { status: "READY_FOR_VISUAL_REVIEW", assets: [], reviewSheet: null, issues: [], execution: { visual: "NO_VISUAL", qa: "PASS" } };
    await writeFile(path.join(contentDirectory, "image-result.json"), `${JSON.stringify(imageResult, null, 2)}\n`, "utf8");
    await writeFile(path.join(contentDirectory, "content-package-with-images.json"), `${JSON.stringify({ ...contentPackage, imageCandidates: imageResult }, null, 2)}\n`, "utf8");
    return { status: "PASS", classification: "NO_VISUAL", assets: [] };
  }

  const sourceDirectory = path.join(contentDirectory, "image-sources");
  await mkdir(sourceDirectory, { recursive: true });
  const args = ["--content-dir", contentDirectory, "--visual-review", "PASS"];
  const executionAssets = [];
  const pending = [];
  for (const asset of request.assets) {
    const selection = asset.sourceSelection;
    let sourcePath;
    let metadata;
    if (selection.sourceType === "APPROVED_BRAND_ASSET") {
      const resolved = await brandResolver({ partType: contentPackage.relations.parts[0]?.partType ?? null, bikeModelId: contentPackage.relations.bikeModels[0]?.bikeModelId ?? null, asset });
      if (!resolved) return { status: "HOLD_CONTENT", reason: "ASSET_DATA_ISSUE", asset: asset.id };
      if (!resolved.relationVerified) return { status: "HOLD_CONTENT", reason: "PRODUCT_MODEL_MISMATCH", asset: asset.id };
      sourcePath = path.join(sourceDirectory, `${asset.id}-brand-source` + path.extname(new URL(resolved.url).pathname || ".webp"));
      if (!existsSync(sourcePath)) await downloader(resolved.url, sourcePath, resolved);
      const qaPath = path.join(sourceDirectory, `${asset.id}.qa.json`);
      if (!existsSync(qaPath)) {
        pending.push({ assetId: asset.id, role: selection.role, task: "VISUAL_QA", sourceFile: path.relative(contentDirectory, sourcePath).replaceAll("\\", "/"), qaSidecar: `${asset.id}.qa.json`, sourceType: selection.sourceType, brand: resolved.brand_name });
        continue;
      }
      const qa = JSON.parse(await readFile(qaPath, "utf8"));
      const visualQa = validateVisualQa(qa, asset, selection.sourceType);
      if (!visualQa.pass) return { status: "HOLD_CONTENT", reason: "IMAGE_QA_FAILED", asset: asset.id, failures: visualQa.failures };
      metadata = { sourceType: selection.sourceType, brand: resolved.brand_name, sourceAsset: resolved.source_asset, bucket: resolved.bucket, objectPath: resolved.objectPath, relationVerified: true, visualQa: qa };
    } else if (["GENERATED_EDUCATIONAL", "GENERATED_GENERIC"].includes(selection.sourceType)) {
      sourcePath = generatedSourcePath(sourceDirectory, asset.id);
      if (!sourcePath) {
        pending.push({ assetId: asset.id, role: selection.role, outputDirectory: sourceDirectory, outputBaseName: asset.id, prompt: asset.prompt, qaSidecar: `${asset.id}.qa.json` });
        continue;
      }
      const qaPath = path.join(sourceDirectory, `${asset.id}.qa.json`);
      if (!existsSync(qaPath)) {
        pending.push({ assetId: asset.id, role: selection.role, task: "VISUAL_QA", sourceFile: path.relative(contentDirectory, sourcePath).replaceAll("\\", "/"), qaSidecar: `${asset.id}.qa.json`, sourceType: selection.sourceType });
        continue;
      }
      const qa = JSON.parse(await readFile(qaPath, "utf8"));
      const visualQa = validateVisualQa(qa, asset, selection.sourceType);
      if (!visualQa.pass) return { status: "HOLD_CONTENT", reason: "IMAGE_QA_FAILED", asset: asset.id, failures: visualQa.failures };
      metadata = { sourceType: selection.sourceType, brand: null, sourceAsset: path.relative(contentDirectory, sourcePath).replaceAll("\\", "/"), prompt: asset.prompt, visualQa: qa };
    } else {
      return { status: "HOLD_CONTENT", reason: "IMAGE_SOURCE_BLOCKED", asset: asset.id };
    }
    args.push(`--${asset.sourceArgument}`, sourcePath);
    executionAssets.push({ id: asset.id, role: selection.role, sourcePath, metadata });
  }
  if (pending.length > 0) {
    const handoff = { status: "BLOCKED_SYSTEM", reason: pending.some((asset) => !asset.sourceFile) ? "IMAGEGEN_OUTPUT_PENDING" : "IMAGE_QA_PENDING", contentKey: request.contentKey, assets: pending };
    await writeFile(path.join(contentDirectory, "image-execution-request.json"), `${JSON.stringify(handoff, null, 2)}\n`, "utf8");
    return handoff;
  }
  const normalized = await imageNormalizer(contentDirectory, args);
  const imageResultPath = path.join(contentDirectory, "image-result.json");
  const imageResult = JSON.parse(await readFile(imageResultPath, "utf8"));
  imageResult.execution = { status: "PASS", assets: executionAssets.map(({ id, role, metadata }) => ({ id, role, ...metadata })) };
  await writeFile(imageResultPath, `${JSON.stringify(imageResult, null, 2)}\n`, "utf8");
  const packagePath = path.join(contentDirectory, "content-package-with-images.json");
  const packageWithImages = JSON.parse(await readFile(packagePath, "utf8"));
  packageWithImages.imageCandidates = imageResult;
  await writeFile(packagePath, `${JSON.stringify(packageWithImages, null, 2)}\n`, "utf8");
  return { status: normalized.status === "READY_FOR_VISUAL_REVIEW" ? "PASS" : "HOLD_CONTENT", reason: normalized.status, assets: executionAssets.map(({ id, metadata }) => ({ id, ...metadata })) };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args["content-dir"]) throw new Error("--content-dir is required");
  await loadEnvironment();
  const contentDirectory = path.resolve(args["content-dir"]);
  const request = JSON.parse(await readFile(path.join(contentDirectory, "image-generation-request.json"), "utf8"));
  const contentPackage = JSON.parse(await readFile(path.join(contentDirectory, "content-package.json"), "utf8"));
  const result = await executeAssets({ contentDirectory, request, contentPackage });
  console.log(JSON.stringify(result, null, 2));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export { executeAssets, resolveApprovedBrandAsset, storageLocation, validateVisualQa };
