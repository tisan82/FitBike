import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { runBrandAssetVisualQa } from "./brand-asset-visual-qa.mjs";

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

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readJsonIfPresent(filePath) {
  if (!existsSync(filePath)) return null;
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch { return null; }
}

async function inspectGeneratedAsset({ sourceDirectory, asset }) {
  const sourcePath = generatedSourcePath(sourceDirectory, asset.id);
  const qaPath = path.join(sourceDirectory, `${asset.id}.qa.json`);
  if (!sourcePath || !existsSync(qaPath)) return { status: "PENDING", sourcePath, qaPath };
  let qa;
  try {
    qa = JSON.parse(await readFile(qaPath, "utf8"));
    const metadata = await sharp(sourcePath).metadata();
    await sharp(sourcePath).stats();
    if (!metadata.width || !metadata.height) throw new Error("IMAGE_DIMENSIONS_MISSING");
  } catch (error) {
    return { status: "BLOCKED_SYSTEM", reason: "IMAGE_RUNTIME_RECEIPT_CORRUPT", error: error instanceof Error ? error.message : String(error), sourcePath, qaPath };
  }
  const visualQa = validateVisualQa(qa, asset, asset.sourceSelection.sourceType);
  if (!visualQa.pass) return { status: "HOLD_CONTENT", reason: "IMAGE_QA_FAILED", failures: visualQa.failures, sourcePath, qaPath, qa };
  return { status: "PASS", sourcePath, qaPath, qa };
}

async function recordGlobalImageCapability({ acquired }) {
  const directory = path.join(projectDirectory, "content-work", "runtime-capabilities");
  await mkdir(directory, { recursive: true });
  const artifact = {
    capability: "IMAGE_GENERATION",
    provider: "BUILT_IN_IMAGE_GEN",
    status: "IMPLEMENTED_AND_E2E_VERIFIED",
    generatedAt: new Date().toISOString(),
    outputFile: path.relative(projectDirectory, acquired.sourcePath).replaceAll("\\", "/"),
    qaFile: path.relative(projectDirectory, acquired.qaPath).replaceAll("\\", "/"),
    outputAcquired: true,
    qaInputReady: true
  };
  await writeFile(path.join(directory, "image-generation.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

function builtInGenerationPrompt({ asset, contentDirectory, sourceDirectory, existingSourcePath = null }) {
  const outputPath = path.join(sourceDirectory, `${asset.id}.png`);
  const qaPath = path.join(sourceDirectory, `${asset.id}.qa.json`);
  return [
    "FitBike Production Educational Image Runtime 작업이다.",
    existingSourcePath ? "기존 출력이 있으므로 새 이미지를 생성하지 말고 view_image로 검사해 QA sidecar만 복원한다." : "반드시 imagegen 스킬과 built-in image_gen 도구를 사용해 새 래스터 이미지 1개만 생성한다.",
    `콘텐츠 디렉터리: ${contentDirectory}`,
    `최종 원본 이미지 경로: ${outputPath}`,
    `최종 QA sidecar 경로: ${qaPath}`,
    `Use case: ${asset.prompt?.useCase ?? "scientific-educational"}`,
    `Asset type: ${asset.prompt?.assetType ?? asset.role}`,
    `Content title: ${asset.prompt?.contentTitle ?? "FitBike educational content"}`,
    `Primary request: ${asset.prompt?.roleDescription ?? "Create a clear educational motorcycle visual."}`,
    `Constraints: ${(asset.prompt?.constraints ?? []).join("; ")}`,
    "생성 결과를 시각적으로 검사한 뒤 프로젝트 경로에 복사한다. 기존 최종 이미지가 있으면 새로 생성하지 않는다.",
    "이미지에는 긴 문장, 로고, 워터마크, 제품 번호, 근거 없는 수치나 실제 기술 구조로 오인될 표현을 넣지 않는다.",
    `QA JSON은 assetId=${asset.id}, sourceType=${asset.sourceSelection.sourceType}와 다음 필드를 포함한다: subjectMatch=true, roleMatch=true, brandAssetFirst=true, productModelMatch=true, technicalMisrepresentation=false, unsupportedNumericClaim=false, unsafeVisual=false, mobileReadability=true, assetAvailability=true, storageReadiness=true.`,
    "검사에 실패하면 해당 boolean을 실제 결과대로 기록한다. 위 이미지와 QA 파일 외에는 어떤 파일도 수정하지 않는다. Git, DB, Storage, Publish 작업을 하지 않는다."
  ].join("\n");
}

async function invokeBuiltInImageGeneration({ asset, contentDirectory, sourceDirectory, existingSourcePath = null }) {
  const prompt = builtInGenerationPrompt({ asset, contentDirectory, sourceDirectory, existingSourcePath });
  await new Promise((resolve, reject) => {
    const child = spawn("codex", ["exec", "--ephemeral", "--sandbox", "workspace-write", "--cd", projectDirectory, prompt], {
      cwd: projectDirectory,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("BUILT_IN_IMAGE_GENERATION_TIMEOUT")); }, 15 * 60 * 1000);
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 10 * 1024 * 1024) child.kill(); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > 10 * 1024 * 1024) child.kill(); });
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`BUILT_IN_IMAGE_GENERATION_EXIT_${code}:${stderr || stdout}`));
    });
  });
  return { status: "COMPLETE", provider: "BUILT_IN_IMAGE_GEN" };
}

async function runEducationalImageRuntime({ asset, contentDirectory, sourceDirectory, generator = invokeBuiltInImageGeneration, retryLimit = 6, retryIntervalMs = 5_000, sleeper = wait }) {
  const receiptPath = path.join(sourceDirectory, `${asset.id}.runtime.json`);
  const existing = await inspectGeneratedAsset({ sourceDirectory, asset });
  if (existing.status === "PASS" || existing.status === "HOLD_CONTENT") return { ...existing, generation: "REUSED", receiptPath };
  if (existing.status === "BLOCKED_SYSTEM") return { ...existing, receiptPath };

  const previousReceipt = await readJsonIfPresent(receiptPath);
  if (existsSync(receiptPath) && !previousReceipt) return { status: "BLOCKED_SYSTEM", reason: "IMAGE_RUNTIME_RECEIPT_CORRUPT", receiptPath };
  const promptHash = createHash("sha256").update(JSON.stringify(asset.prompt ?? {})).digest("hex");
  const requestedAt = new Date().toISOString();
  const receipt = {
    status: "GENERATION_REQUESTED",
    provider: "BUILT_IN_IMAGE_GEN",
    assetId: asset.id,
    sourceType: asset.sourceSelection.sourceType,
    promptHash,
    requestMode: existing.sourcePath ? "QA_ACQUISITION" : "GENERATION_AND_ACQUISITION",
    requestAttemptCount: Number(previousReceipt?.requestAttemptCount ?? previousReceipt?.generationCount ?? 0) + 1,
    generationCount: Number(previousReceipt?.generationCount ?? 0),
    requestedAt,
    outputFile: path.relative(projectDirectory, path.join(sourceDirectory, `${asset.id}.png`)).replaceAll("\\", "/"),
    qaFile: path.relative(projectDirectory, path.join(sourceDirectory, `${asset.id}.qa.json`)).replaceAll("\\", "/")
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  let generation;
  try { generation = await generator({ asset, contentDirectory, sourceDirectory, existingSourcePath: existing.sourcePath, receipt }); }
  catch (error) {
    const failed = { ...receipt, status: "GENERATION_FAILED", failedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) };
    await writeFile(receiptPath, `${JSON.stringify(failed, null, 2)}\n`, "utf8");
    return { status: "BLOCKED_SYSTEM", reason: "IMAGE_GENERATION_RUNTIME_FAILURE", error: failed.error, receiptPath };
  }

  let acquired = await inspectGeneratedAsset({ sourceDirectory, asset });
  for (let attempt = 0; acquired.status === "PENDING" && attempt < retryLimit; attempt += 1) {
    await sleeper(retryIntervalMs);
    acquired = await inspectGeneratedAsset({ sourceDirectory, asset });
  }
  if (acquired.status === "PENDING") {
    const pending = { ...receipt, status: "OUTPUT_ACQUISITION_FAILED", generationStatus: generation?.status ?? "UNKNOWN", failedAt: new Date().toISOString() };
    await writeFile(receiptPath, `${JSON.stringify(pending, null, 2)}\n`, "utf8");
    return { status: "BLOCKED_SYSTEM", reason: "IMAGE_OUTPUT_ACQUISITION_TIMEOUT", receiptPath };
  }
  const completed = { ...receipt, status: acquired.status === "PASS" ? "OUTPUT_ACQUIRED" : acquired.status, generationCount: receipt.generationCount + (existing.sourcePath ? 0 : 1), completedAt: new Date().toISOString(), generationStatus: generation?.status ?? "COMPLETE" };
  await writeFile(receiptPath, `${JSON.stringify(completed, null, 2)}\n`, "utf8");
  if (acquired.status === "PASS" && generator === invokeBuiltInImageGeneration) await recordGlobalImageCapability({ acquired });
  return { ...acquired, generation: "EXECUTED", receiptPath };
}

async function normalizeImages(contentDirectory, args) {
  const { stdout } = await execute(process.execPath, [path.join(imageDirectory, "generate-images.mjs"), ...args], { cwd: projectDirectory, maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function executeAssets({ contentDirectory, request, contentPackage, brandResolver = resolveApprovedBrandAsset, downloader = downloadAsset, imageNormalizer = normalizeImages, brandVisualQa = runBrandAssetVisualQa, educationalRuntime = runEducationalImageRuntime }) {
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
        try {
          const generatedQa = await brandVisualQa({ contentDirectory, sourcePath, asset, resolved, expectedBrand: selection.brand, persist: true });
          if (generatedQa.final !== "PASS") return { status: "HOLD_CONTENT", reason: "IMAGE_QA_FAILED", asset: asset.id, failures: generatedQa.failures };
        } catch (error) {
          return { status: "BLOCKED_SYSTEM", reason: "BRAND_ASSET_VISUAL_QA_RUNTIME_ERROR", asset: asset.id, error: error instanceof Error ? error.message : String(error) };
        }
      }
      const qa = JSON.parse(await readFile(qaPath, "utf8"));
      const visualQa = validateVisualQa(qa, asset, selection.sourceType);
      if (!visualQa.pass) return { status: "HOLD_CONTENT", reason: "IMAGE_QA_FAILED", asset: asset.id, failures: visualQa.failures };
      metadata = { sourceType: selection.sourceType, brand: resolved.brand_name, sourceAsset: resolved.source_asset, bucket: resolved.bucket, objectPath: resolved.objectPath, relationVerified: true, visualQa: qa };
    } else if (["GENERATED_EDUCATIONAL", "GENERATED_GENERIC"].includes(selection.sourceType)) {
      sourcePath = generatedSourcePath(sourceDirectory, asset.id);
      const qaPath = path.join(sourceDirectory, `${asset.id}.qa.json`);
      if (!sourcePath || !existsSync(qaPath)) {
        const generated = await educationalRuntime({ asset, contentDirectory, sourceDirectory });
        if (generated.status === "BLOCKED_SYSTEM") return { ...generated, asset: asset.id };
        if (generated.status === "HOLD_CONTENT") return { ...generated, asset: asset.id };
        sourcePath = generated.sourcePath;
      }
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

export { builtInGenerationPrompt, executeAssets, inspectGeneratedAsset, invokeBuiltInImageGeneration, resolveApprovedBrandAsset, runEducationalImageRuntime, storageLocation, validateVisualQa };
