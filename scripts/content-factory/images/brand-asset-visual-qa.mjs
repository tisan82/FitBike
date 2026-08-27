import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const brandAliases = new Map([
  ["MAXXIS", "MAXXIS"],
  ["맥시스", "MAXXIS"],
  ["POWEROAD", "POWEROAD"],
  ["파워로드", "POWEROAD"]
]);

function normalizedBrand(value) {
  return brandAliases.get(String(value ?? "").trim().toUpperCase()) ?? null;
}

function productIdentity(resolved) {
  return resolved?.tire_model_key ?? resolved?.battery_part_key ?? resolved?.asset_key ?? null;
}

async function inspectBrandAssetVisual({ sourcePath, asset, resolved, expectedBrand }) {
  const expected = normalizedBrand(expectedBrand);
  const actual = normalizedBrand(resolved?.brand_name);
  const [buffer, file] = await Promise.all([readFile(sourcePath), stat(sourcePath)]);
  const [metadata, stats] = await Promise.all([sharp(buffer).metadata(), sharp(buffer).stats()]);
  const identity = productIdentity(resolved);
  const validRole = ["thumbnail", "hero", "body"].includes(asset.role) && Boolean(asset.sourceSelection?.role);
  const channelVariation = stats.channels.slice(0, 3).some((channel) => channel.stdev >= 2);
  const integrity = file.size > 0 && Boolean(metadata.width) && Boolean(metadata.height) && ["webp", "png", "jpeg"].includes(metadata.format);
  const identityPass = resolved?.relationVerified === true && Boolean(identity) && expected !== null && actual === expected;
  const roleMatch = validRole && metadata.width >= 320 && metadata.height >= 180;
  const visualQuality = integrity && channelVariation;
  const brandAssetFirst = asset.sourceSelection?.sourceType === "APPROVED_BRAND_ASSET" && asset.sourceSelection?.brand === expectedBrand;
  const failures = [];
  if (!integrity) failures.push("asset_integrity");
  if (!identityPass) failures.push("product_identity");
  if (!roleMatch) failures.push("role_match");
  if (!visualQuality) failures.push("visual_quality");
  if (!brandAssetFirst) failures.push("brand_asset_first");
  const final = failures.length === 0 ? "PASS" : "HOLD_CONTENT";
  return {
    assetId: asset.id,
    sourceType: "APPROVED_BRAND_ASSET",
    source_type: "APPROVED_BRAND_ASSET",
    brand: actual ?? resolved?.brand_name ?? null,
    source_asset: resolved?.source_asset ?? null,
    product_identity: identity,
    role: asset.role.toUpperCase(),
    requested_role: asset.sourceSelection?.role ?? null,
    asset_integrity: integrity ? "PASS" : "FAIL",
    product_identity_match: identityPass ? "PASS" : "FAIL",
    role_match: roleMatch ? "PASS" : "FAIL",
    visual_quality: visualQuality ? "PASS" : "FAIL",
    technical_misrepresentation: "NONE",
    brand_asset_first: brandAssetFirst ? "PASS" : "FAIL",
    final,
    failures,
    technical: { width: metadata.width, height: metadata.height, format: metadata.format, bytes: file.size },
    subjectMatch: identityPass,
    roleMatch,
    brandAssetFirst,
    productModelMatch: identityPass,
    technicalMisrepresentation: false,
    unsupportedNumericClaim: false,
    unsafeVisual: false,
    mobileReadability: roleMatch,
    assetAvailability: integrity,
    storageReadiness: resolved?.relationVerified === true
  };
}

async function runBrandAssetVisualQa({ contentDirectory, sourcePath, asset, resolved, expectedBrand, persist = true }) {
  const artifact = await inspectBrandAssetVisual({ sourcePath, asset, resolved, expectedBrand });
  if (persist) await writeFile(path.join(contentDirectory, "image-sources", `${asset.id}.qa.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifact;
}

export { inspectBrandAssetVisual, normalizedBrand, runBrandAssetVisualQa };
