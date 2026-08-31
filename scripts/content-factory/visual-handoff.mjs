import fs from "node:fs";
import path from "node:path";

const VERSION = 1;

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeJson(file, value) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n"); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

export function visualHandoffPaths(contentDir) {
  return {
    request: path.join(contentDir, "visual-request.json"),
    receipt: path.join(contentDir, "visual-receipt.json")
  };
}

export function createVisualRequest({ contentDir, candidate, visual, contentPackage, runId = null }) {
  const files = visualHandoffPaths(contentDir);
  const existing = fs.existsSync(files.request) ? readJson(files.request) : null;
  const request = existing ?? {
    schemaVersion: VERSION,
    status: "VISUAL_REQUIRED",
    runId,
    contentKey: candidate.topic_key,
    topicId: candidate.content_topic_id ?? null,
    title: contentPackage?.title ?? candidate.topic,
    contentType: candidate.content_type,
    partType: candidate.part_type ?? null,
    visualStrategy: visual ?? {},
    requirements: contentPackage?.visualRequirements ?? contentPackage?.visual_requirements ?? [],
    policy: {
      mobileFirst: true,
      noUnverifiedModelPhoto: true,
      noDuplicateImageReuse: true,
      brandAssetFirst: true,
      captionsRequired: true,
      altRequired: true,
      generatedReferenceMustNotBeLabeledRealPhoto: true
    },
    expectedReceipt: "visual-receipt.json"
  };
  writeJson(files.request, request);
  return { request, files };
}

export function readVisualReceipt(contentDir) {
  const { receipt } = visualHandoffPaths(contentDir);
  if (!fs.existsSync(receipt)) return null;
  const value = readJson(receipt);
  if (value?.status !== "VISUAL_READY") throw new Error("VISUAL_RECEIPT_NOT_READY");
  if (!Array.isArray(value.assets) || value.assets.length === 0) throw new Error("VISUAL_RECEIPT_ASSETS_MISSING");
  for (const asset of value.assets) {
    if (!asset.url || !asset.role || !asset.alt || !asset.caption) throw new Error("VISUAL_RECEIPT_ASSET_INVALID");
  }
  return value;
}

export function resolveVisualHandoff({ contentDir, candidate, visual, contentPackage, runId = null }) {
  const receipt = readVisualReceipt(contentDir);
  if (receipt) return { status: "VISUAL_READY", receipt };
  const { request } = createVisualRequest({ contentDir, candidate, visual, contentPackage, runId });
  return {
    status: "VISUAL_REQUIRED",
    request,
    systemBlock: {
      failureScope: "CANDIDATE",
      errorCode: "VISUAL_HANDOFF_REQUIRED",
      reason: "VISUAL_HANDOFF_REQUIRED",
      resumeFrom: "ASSET_GENERATION_OR_SELECTION"
    }
  };
}
