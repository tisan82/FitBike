import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const factoryDirectory = path.dirname(fileURLToPath(import.meta.url));

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateTextBlock(block, index, failures) {
  const label = `bodyBlocks[${index}]`;
  if (!block || typeof block !== "object" || !nonEmpty(block.type)) {
    failures.push(`${label}:INVALID_BLOCK`);
    return;
  }
  if (["heading", "paragraph"].includes(block.type) && !nonEmpty(block.text)) failures.push(`${label}:EMPTY_TEXT`);
  if (["tip", "warning"].includes(block.type) && (!nonEmpty(block.title) || !nonEmpty(block.body))) failures.push(`${label}:EMPTY_CALLOUT`);
  if (["bullet_list", "numbered_list"].includes(block.type) && (!Array.isArray(block.items) || block.items.length === 0 || block.items.some((item) => !nonEmpty(item)))) failures.push(`${label}:EMPTY_LIST`);
  if (block.type === "table" && (!Array.isArray(block.headers) || block.headers.length === 0 || !Array.isArray(block.rows) || block.rows.length === 0)) failures.push(`${label}:EMPTY_TABLE`);
  if (block.type === "image") {
    if (!nonEmpty(block.storagePath) || !nonEmpty(block.alt) || !nonEmpty(block.caption)) failures.push(`${label}:IMAGE_META_MISSING`);
  }
  if (block.type === "image_gallery") {
    if (!Array.isArray(block.images) || block.images.length < 2) failures.push(`${label}:GALLERY_REQUIRES_2_IMAGES`);
    else for (const [imageIndex, image] of block.images.entries()) {
      if (!nonEmpty(image?.storagePath) || !nonEmpty(image?.alt) || !nonEmpty(image?.caption)) failures.push(`${label}.images[${imageIndex}]:IMAGE_META_MISSING`);
    }
  }
}

async function hashFile(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function validateAssetUniqueness(contentDirectory, assets, failures) {
  const body = assets.filter((asset) => asset.type === "body" && asset.status === "PASS");
  const seenFiles = new Set();
  const seenHashes = new Map();
  for (const asset of body) {
    if (!nonEmpty(asset.file)) {
      failures.push(`${asset.id}:ASSET_FILE_MISSING`);
      continue;
    }
    if (seenFiles.has(asset.file)) failures.push(`${asset.id}:DUPLICATE_BODY_FILE`);
    seenFiles.add(asset.file);
    const file = path.join(contentDirectory, asset.file);
    if (!existsSync(file)) {
      failures.push(`${asset.id}:ASSET_NOT_FOUND`);
      continue;
    }
    const hash = await hashFile(file);
    if (seenHashes.has(hash)) failures.push(`${asset.id}:DUPLICATE_BODY_HASH_WITH_${seenHashes.get(hash)}`);
    else seenHashes.set(hash, asset.id);
  }

  const roleAssets = assets.filter((asset) => ["thumbnail", "hero", "body"].includes(asset.type) && asset.status === "PASS" && nonEmpty(asset.file));
  const roleHashes = new Map();
  for (const asset of roleAssets) {
    const file = path.join(contentDirectory, asset.file);
    if (!existsSync(file)) continue;
    const hash = await hashFile(file);
    const previous = roleHashes.get(hash);
    if (previous && previous.type !== asset.type && (asset.type === "body" || previous.type === "body")) failures.push(`${asset.id}:BODY_REUSES_${previous.type.toUpperCase()}_${previous.id}`);
    else if (!previous) roleHashes.set(hash, asset);
  }
}

export async function evaluateContentQuality({ contentDirectory, rules, packageWithImages, imageResult, imageRequest = null }) {
  const failures = [];
  const warnings = [];
  const content = packageWithImages?.content ?? {};
  const bodyBlocks = Array.isArray(content.bodyBlocks) ? content.bodyBlocks : [];
  const contentType = content.contentType;
  const typeRules = rules?.[contentType]?.images;
  const globalRules = rules?.globalImageQuality ?? {};

  if (!nonEmpty(content.contentKey)) failures.push("CONTENT_KEY_MISSING");
  if (!nonEmpty(content.title)) failures.push("TITLE_MISSING");
  if (!nonEmpty(content.summary)) failures.push("SUMMARY_MISSING");
  if (!Array.isArray(content.bodyBlocks) || bodyBlocks.length === 0) failures.push("BODY_BLOCKS_EMPTY");
  bodyBlocks.forEach((block, index) => validateTextBlock(block, index, failures));

  const galleryPaths = [];
  for (const block of bodyBlocks) {
    if (block?.type === "image" && nonEmpty(block.storagePath)) galleryPaths.push(block.storagePath);
    if (block?.type === "image_gallery" && Array.isArray(block.images)) galleryPaths.push(...block.images.map((image) => image?.storagePath).filter(nonEmpty));
  }
  if (globalRules.rejectDuplicateBodyPaths && new Set(galleryPaths).size !== galleryPaths.length) failures.push("DUPLICATE_BODY_PATH");

  if (imageResult?.status !== "READY_FOR_VISUAL_REVIEW") failures.push("IMAGE_RESULT_NOT_READY");
  const assets = Array.isArray(imageResult?.assets) ? imageResult.assets : [];
  if (assets.some((asset) => asset.status !== "PASS")) failures.push("IMAGE_ASSET_FAILED");

  const requiredPlans = Array.isArray(packageWithImages?.images?.bodyImages) ? packageWithImages.images.bodyImages.filter((plan) => plan.required) : [];
  const passedBodyAssets = assets.filter((asset) => asset.type === "body" && asset.status === "PASS");
  if (passedBodyAssets.length !== requiredPlans.length) failures.push(`BODY_IMAGE_COUNT_MISMATCH:${passedBodyAssets.length}/${requiredPlans.length}`);
  if (typeRules && passedBodyAssets.length < Number(typeRules.minimumBodyImages ?? 0)) failures.push(`MINIMUM_BODY_IMAGES:${passedBodyAssets.length}/${typeRules.minimumBodyImages}`);

  if (globalRules.requireNonEmptyCaption || globalRules.requireVisualPurposeCaption) {
    for (const [index, plan] of requiredPlans.entries()) {
      if (!nonEmpty(plan?.description)) failures.push(`body-${String(index + 1).padStart(2, "0")}:CAPTION_SOURCE_MISSING`);
    }
  }

  if (imageRequest && Array.isArray(imageRequest.assets)) {
    for (const request of imageRequest.assets.filter((asset) => asset.type === "body")) {
      if (globalRules.externalPhotoMustHaveSourceAndUsageBasis && request.sourceSelection?.sourceType === "EXTERNAL" && !nonEmpty(request.sourceSelection?.sourceAsset)) failures.push(`${request.id}:EXTERNAL_SOURCE_BASIS_MISSING`);
    }
  }

  await validateAssetUniqueness(contentDirectory, assets, failures);

  if (contentType === "MODEL_GUIDE" && typeRules?.requireVerifiedModelAsset) {
    const modelEvidence = packageWithImages?.images?.modelAssetVerification ?? packageWithImages?.modelAssetVerification ?? null;
    if (modelEvidence?.status === "UNVERIFIED") failures.push("MODEL_ASSET_UNVERIFIED");
    if (!modelEvidence) warnings.push("MODEL_ASSET_VERIFICATION_NOT_EMBEDDED");
  }

  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    contentKey: content.contentKey ?? null,
    contentType: contentType ?? null,
    checks: {
      bodyBlocks: bodyBlocks.length,
      requiredBodyImages: requiredPlans.length,
      passedBodyImages: passedBodyAssets.length,
      minimumBodyImages: Number(typeRules?.minimumBodyImages ?? 0),
      failures,
      warnings
    }
  };
}

export async function runContentQualityGate(contentDirectory) {
  const [rules, packageWithImages, imageResult, imageRequest] = await Promise.all([
    readJson(path.join(factoryDirectory, "content-type-rules.json")),
    readJson(path.join(contentDirectory, "content-package-with-images.json")),
    readJson(path.join(contentDirectory, "image-result.json")),
    existsSync(path.join(contentDirectory, "image-generation-request.json")) ? readJson(path.join(contentDirectory, "image-generation-request.json")) : Promise.resolve(null)
  ]);
  const result = await evaluateContentQuality({ contentDirectory, rules, packageWithImages, imageResult, imageRequest });
  await writeFile(path.join(contentDirectory, "content-qa-gate.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) throw new Error("INVALID_ARGUMENTS");
    args[argv[index].slice(2)] = argv[index + 1];
  }
  return args;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const args = parseArguments(process.argv.slice(2));
  if (!args["content-dir"]) throw new Error("--content-dir is required");
  runContentQualityGate(path.resolve(args["content-dir"]))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== "PASS") process.exitCode = 2;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
