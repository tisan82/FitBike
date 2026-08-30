import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { selectImageSource } from "./image-source-policy.mjs";

const imageFactoryDirectory = path.dirname(fileURLToPath(import.meta.url));

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Invalid CLI argument near ${key ?? "end of input"}`);
    }
    result[key.slice(2)] = value.trim();
  }
  return result;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function requestedAssets(imagePlan) {
  const assets = [];
  if (imagePlan.thumbnail?.required) assets.push({ id: "thumbnail", role: "thumbnail", index: null, plan: imagePlan.thumbnail });
  if (imagePlan.hero?.required) assets.push({ id: "hero", role: "hero", index: null, plan: imagePlan.hero });
  imagePlan.bodyImages.forEach((plan, index) => assets.push({ id: `body-${String(index + 1).padStart(2, "0")}`, role: "body", index: index + 1, plan }));
  return assets;
}

function outputName(asset, rules) {
  if (asset.role !== "body") return rules.assets[asset.role].fileName;
  return rules.assets.body.fileNamePattern.replace("{index}", String(asset.index).padStart(2, "0"));
}

function buildPrompt(asset, contentPackage, rules) {
  const common = [
    "No brand logos, trademarks, watermarks, product numbers, advertising copy, or decorative feature chips.",
    "No technical values, voltage, CCA, Ah, polarity marks, terminal direction claims, or model-specific specifications.",
    "No text inside the image unless the image plan explicitly requires a short educational label."
  ];
  return {
    useCase: asset.role === "body" ? "scientific-educational" : "photorealistic-natural",
    assetType: asset.role,
    contentTitle: contentPackage.content.title,
    roleDescription: asset.plan.description,
    constraints: [...common, ...rules.generation.prohibited]
  };
}

async function prepareRequests(contentDirectory, imagePlan, contentPackage, rules) {
  const registry = await readJson(path.join(imageFactoryDirectory, "brand-asset-registry.json"));
  const partType = contentPackage.relations.parts[0]?.partType ?? null;
  const assets = requestedAssets(imagePlan);
  const selections = assets.map((asset) => {
    const brandRegistry = registry.brands[partType];
    const imageRole = asset.plan.imageRole ?? (asset.role === "body" && asset.plan.type === "diagram" ? "EDUCATIONAL_DIAGRAM" : "PRODUCT_REPRESENTATION");
    return { role: imageRole, ...selectImageSource({ partType, role: asset.role, imageRole, brandAssetAvailable: (brandRegistry?.availableAssetCount ?? 0) > 0 || Boolean(asset.plan.sourceAsset), brandAssetLookupAvailable: Boolean(brandRegistry?.brand), brandAssetSuitable: asset.plan.brandAssetSuitable !== false, sourceAsset: asset.plan.sourceAsset ?? null, fallbackReason: asset.plan.brand_asset_not_suitable_reason ?? null }) };
  });
  const request = {
    status: assets.length === 0 ? "NO_IMAGES_REQUIRED" : selections.some((selection) => selection.status === "FAIL") ? "IMAGE_SOURCE_BLOCKED" : selections.every((selection) => selection.sourceType === "APPROVED_BRAND_ASSET") ? "READY_FOR_BRAND_ASSET" : "READY_FOR_IMAGE_GENERATION",
    contentKey: contentPackage.content.contentKey,
    assets: assets.map((asset, index) => ({
      id: asset.id,
      role: asset.role,
      sourceArgument: `${asset.id}-source`,
      outputFile: outputName(asset, rules),
      standard: rules.assets[asset.role],
      sourceSelection: selections[index],
      prompt: selections[index].sourceType.startsWith("GENERATED") ? buildPrompt(asset, contentPackage, rules) : null
    }))
  };
  await writeFile(path.join(contentDirectory, "image-generation-request.json"), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  return request;
}

async function convertCandidate(sourcePath, outputPath, standard) {
  await sharp(sourcePath)
    .rotate()
    .resize(standard.width, standard.height, { fit: "cover", position: "centre" })
    .toColourspace("srgb")
    .webp({ quality: 88 })
    .toFile(outputPath);
  const metadata = await sharp(outputPath).metadata();
  await sharp(outputPath).stats();
  const file = await stat(outputPath);
  const checks = {
    fileExists: existsSync(outputPath),
    format: metadata.format === standard.format,
    dimensions: metadata.width === standard.width && metadata.height === standard.height,
    fileSize: file.size > 0,
    colourspace: metadata.space === standard.colourspace,
    corrupt: false
  };
  return { checks, metadata: { width: metadata.width, height: metadata.height, format: metadata.format, colourspace: metadata.space, bytes: file.size } };
}

async function fileSha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function markDuplicateBodyImages(assetResults) {
  const bodyAssets = assetResults.filter((asset) => asset.type === "body" && asset.absoluteFile && asset.status !== "FAIL");
  const byHash = new Map();
  for (const asset of bodyAssets) {
    const hash = await fileSha256(asset.absoluteFile);
    const matches = byHash.get(hash) ?? [];
    matches.push(asset);
    byHash.set(hash, matches);
  }

  const duplicateGroups = [...byHash.values()].filter((group) => group.length > 1);
  for (const group of duplicateGroups) {
    const ids = group.map((asset) => asset.id).join(", ");
    for (const asset of group) {
      asset.status = "REVIEW_REQUIRED";
      asset.issues.push(`Duplicate body image output: ${ids}`);
    }
  }
  return duplicateGroups.map((group) => group.map((asset) => asset.id));
}

async function createReviewSheet(assetResults, outputDirectory) {
  if (assetResults.length < 2) return null;
  const panelWidth = 800;
  const panelHeight = 520;
  const labelHeight = 56;
  const panels = await Promise.all(assetResults.map(async (asset) => {
    const image = await sharp(asset.absoluteFile).resize(panelWidth, panelHeight - labelHeight, { fit: "contain", background: "#f3f4f6" }).png().toBuffer();
    const label = `<svg width="${panelWidth}" height="${labelHeight}"><rect width="100%" height="100%" fill="#111827"/><text x="24" y="37" fill="white" font-size="24" font-family="Arial, sans-serif">${asset.label}</text></svg>`;
    return sharp({ create: { width: panelWidth, height: panelHeight, channels: 3, background: "#f3f4f6" } })
      .composite([{ input: Buffer.from(label), top: 0, left: 0 }, { input: image, top: labelHeight, left: 0 }])
      .png()
      .toBuffer();
  }));
  const sheetPath = path.join(outputDirectory, "content-image-review-sheet.webp");
  await sharp({ create: { width: panelWidth, height: panelHeight * panels.length, channels: 3, background: "#ffffff" } })
    .composite(panels.map((input, index) => ({ input, top: panelHeight * index, left: 0 })))
    .webp({ quality: 88 })
    .toFile(sheetPath);
  return sheetPath;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args["content-dir"]) throw new Error("--content-dir is required");
  const contentDirectory = path.resolve(args["content-dir"]);
  const imagePlan = await readJson(path.join(contentDirectory, "image-plan.json"));
  const contentPackage = await readJson(path.join(contentDirectory, "content-package.json"));
  const rules = await readJson(path.join(imageFactoryDirectory, "image-rules.json"));
  const request = await prepareRequests(contentDirectory, imagePlan, contentPackage, rules);
  if (args.mode === "prepare") {
    console.log(JSON.stringify(request, null, 2));
    return;
  }

  const outputDirectory = path.join(contentDirectory, "images");
  await mkdir(outputDirectory, { recursive: true });
  const visualReview = args["visual-review"]?.toUpperCase() ?? "PENDING";
  if (!["PASS", "FAIL", "PENDING"].includes(visualReview)) throw new Error("--visual-review must be PASS, FAIL, or PENDING");
  const assets = [];
  for (const assetRequest of request.assets) {
    const sourcePath = args[assetRequest.sourceArgument];
    if (!sourcePath) {
      assets.push({ type: assetRequest.role, id: assetRequest.id, file: null, status: "FAIL", issues: [`Missing --${assetRequest.sourceArgument}`] });
      continue;
    }
    const outputPath = path.join(outputDirectory, assetRequest.outputFile);
    const technical = await convertCandidate(path.resolve(sourcePath), outputPath, assetRequest.standard);
    const technicalPass = technical.checks.fileExists
      && technical.checks.format
      && technical.checks.dimensions
      && technical.checks.fileSize
      && technical.checks.colourspace
      && technical.checks.corrupt === false;
    const issues = [];
    if (!technicalPass) issues.push("Technical image QA failed");
    if (visualReview !== "PASS") issues.push(visualReview === "FAIL" ? "Visual rule QA failed" : "Visual rule QA is pending");
    assets.push({
      type: assetRequest.role,
      id: assetRequest.id,
      file: path.relative(contentDirectory, outputPath).replaceAll("\\", "/"),
      absoluteFile: outputPath,
      label: assetRequest.role === "body" ? `BODY ${String(assetRequest.id).slice(-2)}` : assetRequest.role.toUpperCase(),
      status: issues.length === 0 ? "PASS" : "REVIEW_REQUIRED",
      technical,
      visualChecks: {
        textOverload: visualReview === "PASS",
        unexpectedLogo: visualReview === "PASS",
        unsupportedTechnicalClaim: visualReview === "PASS",
        requestedRole: visualReview === "PASS"
      },
      issues
    });
  }

  const duplicateBodyImages = await markDuplicateBodyImages(assets);
  const missingSource = assets.some((asset) => asset.status === "FAIL");
  const reviewRequired = assets.some((asset) => asset.status === "REVIEW_REQUIRED");
  const status = missingSource ? "FAILED" : reviewRequired ? "REVIEW_REQUIRED" : "READY_FOR_VISUAL_REVIEW";
  const sheetPath = await createReviewSheet(assets.filter((asset) => asset.file), outputDirectory);
  const serializableAssets = assets.map((asset) => Object.fromEntries(
    Object.entries(asset).filter(([key]) => !["absoluteFile", "label"].includes(key))
  ));
  const imageResult = {
    status,
    assets: serializableAssets,
    reviewSheet: sheetPath ? path.relative(contentDirectory, sheetPath).replaceAll("\\", "/") : null,
    duplicateBodyImages,
    issues: serializableAssets.flatMap((asset) => asset.issues)
  };
  await writeFile(path.join(contentDirectory, "image-result.json"), `${JSON.stringify(imageResult, null, 2)}\n`, "utf8");
  const packageWithImages = { ...contentPackage, imageCandidates: imageResult };
  await writeFile(path.join(contentDirectory, "content-package-with-images.json"), `${JSON.stringify(packageWithImages, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status, contentDirectory, assets: serializableAssets.length, reviewSheet: imageResult.reviewSheet, duplicateBodyImages }, null, 2));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export { buildPrompt, markDuplicateBodyImages, prepareRequests, requestedAssets };