import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function inspectPublishArtifactConsistency({ contentPackage, qa, evidence, imageResult, packageWithImages }) {
  const checks = {
    content: sameJson(packageWithImages?.content, contentPackage?.content),
    qa: sameJson(packageWithImages?.qa, qa),
    evidence: packageWithImages?.artifactSynchronization?.evidenceHash === digest(evidence),
    images: sameJson(packageWithImages?.imageCandidates, imageResult)
  };
  return { status: Object.values(checks).every(Boolean) ? "CONSISTENT" : "STALE", checks };
}

function synchronizePublishPackage({ contentPackage, qa, evidence, imageResult, packageWithImages, risk = null, approval = null }) {
  if (!contentPackage?.content || !qa || !evidence || !imageResult || !packageWithImages?.imageCandidates) throw new Error("ARTIFACT_SYNCHRONIZATION_INPUT_MISSING");
  if (!sameJson(packageWithImages.imageCandidates, imageResult)) throw new Error("ARTIFACT_SYNCHRONIZATION_IMAGE_CONFLICT");
  return {
    ...packageWithImages,
    content: contentPackage.content,
    qa,
    artifactSynchronization: {
      source: "QA_JSON",
      contentHash: digest(contentPackage.content),
      qaHash: digest(qa),
      evidenceHash: digest(evidence),
      imageHash: digest(imageResult),
      risk,
      approval
    }
  };
}

async function synchronizePublishArtifacts(contentDirectory, { required = true, risk = null, approval = null } = {}) {
  const packagePath = path.join(contentDirectory, "content-package-with-images.json");
  if (!existsSync(packagePath)) {
    if (required) throw new Error("ARTIFACT_SYNCHRONIZATION_PACKAGE_MISSING");
    return { status: "NOT_APPLICABLE" };
  }
  const readJson = async (name) => JSON.parse(await readFile(path.join(contentDirectory, name), "utf8"));
  const [contentPackage, qa, evidence, imageResult, packageWithImages] = await Promise.all([
    readJson("content-package.json"),
    readJson("qa.json"),
    readJson("evidence.json"),
    readJson("image-result.json"),
    readJson("content-package-with-images.json")
  ]);
  const before = inspectPublishArtifactConsistency({ contentPackage, qa, evidence, imageResult, packageWithImages });
  const synchronized = synchronizePublishPackage({ contentPackage, qa, evidence, imageResult, packageWithImages, risk, approval });
  const temporaryPath = `${packagePath}.synchronizing`;
  await writeFile(temporaryPath, `${JSON.stringify(synchronized, null, 2)}\n`, "utf8");
  await rename(temporaryPath, packagePath);
  const after = inspectPublishArtifactConsistency({ contentPackage, qa, evidence, imageResult, packageWithImages: synchronized });
  if (after.status !== "CONSISTENT") throw new Error("ARTIFACT_SYNCHRONIZATION_FAILED");
  return { status: "PASS", before: before.status, after: after.status, checks: after.checks, packageWithImages: synchronized };
}

export { inspectPublishArtifactConsistency, synchronizePublishArtifacts, synchronizePublishPackage };
