import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { classifyTopicRisk } from "./automation-policy.mjs";
import { runAutonomousBatch } from "./autonomous-batch-engine.mjs";
import { deriveModelCandidates } from "./autonomous-policy.mjs";
import { evaluateCapabilities } from "./production-capabilities.mjs";
import { repairContentDirectory } from "./content-repair.mjs";
import { synchronizePublishArtifacts } from "./artifact-synchronization.mjs";

const execute = promisify(execFile);
const factoryDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(factoryDirectory, "../..");

function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) throw new Error("INVALID_ARGUMENTS");
    args[argv[index].slice(2)] = argv[index + 1];
  }
  return args;
}

async function loadLocalEnvironment() {
  const file = path.join(projectDirectory, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()] !== undefined) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

async function managementQuery(query, parameters = []) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!url || !accessToken) throw new Error("REGISTRY_ACCESS_UNAVAILABLE");
  const projectRef = new URL(url).hostname.split(".")[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, parameters, read_only: true })
  });
  if (!response.ok) throw new Error(`REGISTRY_DB_ERROR:${response.status}`);
  return response.json();
}

async function loadProductionInputs(maxCandidates, resumeTopicKeys = []) {
  const resumeClause = resumeTopicKeys.length ? `or t.topic_key = any($2::text[])` : "";
  const resumeOrder = resumeTopicKeys.length ? `case when t.topic_key = any($2::text[]) then 0 else 1 end,` : "";
  const queuedCandidates = await managementQuery(`select t.content_topic_id,t.topic_key,t.topic,t.content_type,t.part_type,t.bike_model_id,b.model_key as bike_model_key,t.normalized_subject,t.normalized_action,t.normalized_scope,t.status,t.priority,t.automation_level,t.risk_level,t.attempt_count,t.last_error,t.content_id,t.created_at from public."16_content_topic" t left join public."02_bike_model" b on b.bike_model_id=t.bike_model_id where (t.status='PLANNED' ${resumeClause}) order by ${resumeOrder}t.priority,t.created_at,t.content_topic_id limit $1`, resumeTopicKeys.length ? [maxCandidates, resumeTopicKeys] : [maxCandidates]);
  const publishedContents = await managementQuery(`select c.content_id,c.content_key,c.title,c.summary,c.content_type,c.body_blocks,coalesce(array_agg(distinct p.part_type) filter (where p.part_type is not null), '{}') as part_types,coalesce(array_agg(distinct b.model_key) filter (where b.model_key is not null), '{}') as model_keys from public."12_content" c left join public."15_content_part_link" p on p.content_id=c.content_id and p.is_active=true left join public."13_content_bike_model" cb on cb.content_id=c.content_id left join public."02_bike_model" b on b.bike_model_id=cb.bike_model_id where c.is_active=true and c.published_at is not null and c.published_at <= now() group by c.content_id,c.content_key,c.title,c.summary,c.content_type,c.body_blocks order by c.content_id`);
  const registryKeys = new Set((await managementQuery(`select topic_key from public."16_content_topic"`)).map((row) => row.topic_key));
  const models = await managementQuery(`select b.bike_model_id,b.model_key,b.model_name_en,b.model_name_ko,bool_or(y.front_tire_full_size is not null or y.rear_tire_full_size is not null) as has_tire_data,bool_or(y.battery_standard_code is not null) as has_battery_data,bool_or(y.front_brake_spec is not null or y.rear_brake_spec is not null) as has_brake_data from public."02_bike_model" b join public."03_bike_model_year" y on y.bike_model_id=b.bike_model_id and y.is_active=true where b.is_active=true group by b.bike_model_id,b.model_key,b.model_name_en,b.model_name_ko order by b.bike_model_id`);
  const generatedCandidates = deriveModelCandidates(models, registryKeys);
  return { candidates: [...queuedCandidates, ...generatedCandidates].slice(0, maxCandidates), publishedContents };
}

async function runScript(script, args) {
  const { stdout } = await execute(process.execPath, [path.join(factoryDirectory, script), ...args], { cwd: projectDirectory, env: process.env, maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function runScriptWithQaStatus(script, args) {
  try {
    return await runScript(script, args);
  } catch (error) {
    if (Number(error?.code) === 2 && error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

async function findCandidateContentDirectory(candidate) {
  const contentRoot = path.join(projectDirectory, "content-work");
  for (const entry of await readdir(contentRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(contentRoot, entry.name);
    try {
      const plan = JSON.parse(await readFile(path.join(directory, "plan.json"), "utf8"));
      if (plan.topic === candidate.topic || plan.targetBikeModelKey === candidate.bike_model_key && plan.targetPart === candidate.part_type) return directory;
    } catch { /* Runtime directory without a content plan. */ }
  }
  return null;
}

async function readRuntimeJson(directory, fileName) {
  try { return JSON.parse(await readFile(path.join(directory, fileName), "utf8")); } catch { return null; }
}

function isLegacyRetryHoldPublishFailure(record) {
  const reason = record.checkpoint?.blockerReason ?? record.history?.at(-1)?.reason ?? "";
  return record.state === "BLOCKED_SYSTEM" && reason.includes("INVALID_STATUS_TRANSITION:BLOCKED->REVIEW_REQUIRED");
}

function normalizeLegacyRetryHoldPublishRecord(record) {
  if (!isLegacyRetryHoldPublishFailure(record)) return record;
  return {
    ...record,
    state: "HOLD_CONTENT",
    retryFrom: "PUBLISH",
    history: [...(record.history ?? []), { state: "HOLD_CONTENT", reason: "RETRY_HOLD_REGISTRY_RESTORE_REQUIRED", retryFrom: "PUBLISH", recoveredCheckpoint: true }],
    holdCheckpoint: { failedStage: "PUBLISH", blockerType: "HOLD_CONTENT", blockerReason: "RETRY_HOLD_REGISTRY_RESTORE_REQUIRED", retryEligible: true, resumeEligible: true }
  };
}

function normalizeProductionQaRecord(record) {
  if (record.state === "PUBLISHED") return { ...record, state: "PUBLISHED_VERIFIED", history: [...(record.history ?? []), { state: "PUBLISHED_VERIFIED", migratedFrom: "PUBLISHED" }] };
  const publishedBeforeQa = record.state === "BLOCKED_SYSTEM" && record.checkpoint?.failedStage === "PRODUCTION_QA" && record.resumeContext?.publish?.status === "PUBLISHED";
  if (!publishedBeforeQa) return record;
  const normalized = {
    ...record,
    state: "PUBLISHED_PENDING_QA",
    qaContext: record.resumeContext,
    history: [...(record.history ?? []), { state: "PUBLISHED_PENDING_QA", reason: "PRODUCTION_QA_PENDING", reconciledCheckpoint: true }]
  };
  delete normalized.resumeFrom;
  delete normalized.resumeContext;
  delete normalized.checkpoint;
  return normalized;
}

async function verifyPublishedContentForProductionQaResume(candidate, context, query = managementQuery) {
  const contentDirectory = context.contentDirectory ?? await findCandidateContentDirectory(candidate);
  if (!contentDirectory) throw new Error("PRODUCTION_QA_RESUME_CONTENT_DIRECTORY_MISSING");
  const publish = await readRuntimeJson(contentDirectory, "publish-result.json");
  const contentKey = publish?.contentKey;
  const contentId = publish?.database?.contentId;
  if (publish?.status !== "PUBLISHED" || !contentKey || !Number.isInteger(contentId)) throw new Error("PRODUCTION_QA_RESUME_PUBLISH_RECEIPT_INVALID");
  const rows = await query(`select c.content_id,c.content_key,c.is_active,c.published_at,t.status as registry_status,t.content_id as registry_content_id from public."12_content" c join public."16_content_topic" t on t.content_id=c.content_id where c.content_key=$1 and t.topic_key=$2`, [contentKey, candidate.topic_key]);
  const published = rows.length === 1 && Number(rows[0].content_id) === contentId && Number(rows[0].registry_content_id) === contentId && rows[0].is_active === true && rows[0].published_at && rows[0].registry_status === "PUBLISHED";
  if (!published) throw new Error("PRODUCTION_QA_RESUME_PUBLISHED_CONTENT_MISSING");
  return { ...context, contentDirectory, publish, productionExistence: { status: "PASS", contentKey, contentId, registryStatus: rows[0].registry_status, productionUrl: `https://fitbike.co.kr/contents/${contentKey}` } };
}

function createProductionStages() {
  return {
    async PREPARE_PRODUCTION_QA_RESUME(candidate, context) {
      return verifyPublishedContentForProductionQaResume(candidate, context);
    },
    async PREPARE_HOLD_RETRY(candidate, record) {
      const reason = record.history.at(-1)?.reason;
      const publishRetry = record.retryFrom === "PUBLISH" || reason === "RETRY_HOLD_REGISTRY_RESTORE_REQUIRED";
      if (reason !== "FACT_QA_FAILED" && !publishRetry) return { resumeFrom: "RESEARCH", context: { gates: {}, holdSignals: {} } };
      const contentDirectory = await findCandidateContentDirectory(candidate);
      if (!contentDirectory) return { resumeFrom: "RESEARCH", context: { gates: {}, holdSignals: {} } };
      const [evidence, imagePlan, imageRequest, imageResult, qa] = await Promise.all([
        readRuntimeJson(contentDirectory, "evidence.json"),
        readRuntimeJson(contentDirectory, "image-plan.json"),
        readRuntimeJson(contentDirectory, "image-generation-request.json"),
        readRuntimeJson(contentDirectory, "image-result.json"),
        readRuntimeJson(contentDirectory, "qa.json")
      ]);
      if (!evidence || !imagePlan || !imageRequest || imageResult?.status !== "READY_FOR_VISUAL_REVIEW") return { resumeFrom: "RESEARCH", context: { gates: {}, holdSignals: {} } };
      if (publishRetry) {
        const contentPass = qa?.status === "READY_FOR_REVIEW" && qa.checks?.unsupportedClaims === 0 && qa.checks?.subjectDrift === true;
        const imagePass = imageResult.assets?.every((asset) => asset.status === "PASS") === true;
        const criticalFact = ["VERIFIED", "VERIFIED_DB", "NOT_REQUIRED"].includes(evidence.status) ? "VERIFIED" : "UNVERIFIED";
        if (!contentPass || !imagePass || criticalFact !== "VERIFIED") return { resumeFrom: "CONTENT_QA", context: { gates: record.gates ?? {}, holdSignals: {}, contentDirectory, evidence, imagePlan, imageRequest, imageResult, generation: { status: "REUSED" } } };
        const gates = { criticalFact, sourceConflict: evidence.conflicts?.length ? "PRESENT" : "NONE", criticalUnverifiedClaim: "NONE", unsupportedNumericClaim: "NONE", unsupportedServiceLimit: "NONE", safetyQa: "PASS", technicalMisrepresentation: "NONE", productModelMismatch: "NONE", duplicateIntentGate: qa.checks?.postGenerationDuplicate?.status === "CONTENT_DUPLICATE" ? "FAIL" : "PASS", contentQa: "PASS", imageQa: "PASS", mandatoryHumanReview: "NONE" };
        return { resumeFrom: "PUBLISH", context: { gates, holdSignals: {}, contentDirectory, evidence, imagePlan, imageRequest, imageResult, qa, generation: { status: "REUSED" } } };
      }
      return { resumeFrom: "CONTENT_QA", context: { gates: record.gates ?? {}, holdSignals: {}, contentDirectory, evidence, imagePlan, imageRequest, imageResult, generation: { status: "REUSED" } } };
    },
    async RESEARCH(candidate, context) {
      if (candidate.generated_candidate) {
        const registered = await runScript("topic-registry.mjs", ["--operation", "register-topic", "--topic-key", candidate.topic_key, "--topic", candidate.topic, "--content-type", candidate.content_type, "--part-type", candidate.part_type, "--bike-model-key", candidate.bike_model_key, "--priority", String(candidate.priority)]);
        if (registered.result !== "REGISTERED") throw new Error(`GENERATED_CANDIDATE_${registered.result}`);
        await runScript("topic-registry.mjs", ["--operation", "classify-topic", "--topic-key", candidate.topic_key, "--apply", "true"]);
      }
      if (context.record.redefinition) {
        await runScript("topic-registry.mjs", ["--operation", "redefine-topic", "--topic-key", candidate.topic_key, "--topic", candidate.topic, "--subject", candidate.normalized_subject, "--action", candidate.normalized_action, "--risk", context.classification.riskLevel, "--automation", context.classification.automationLevel]);
      }
      await runScript("topic-registry.mjs", ["--operation", "record-automation-attempt", "--topic-key", candidate.topic_key]);
      await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "GENERATING"]);
      const generationArgs = ["--topic", candidate.topic, "--type", candidate.content_type, ...(candidate.part_type ? ["--part", candidate.part_type] : []), ...(candidate.bike_model_key ? ["--bike-model-key", candidate.bike_model_key] : [])];
      const generation = await runScript("generate-content.mjs", generationArgs);
      if (!generation.outputDirectory) return { ...context, holdSignals: { ...context.holdSignals, UNRESOLVED_DUPLICATE: true }, generation };
      return { ...context, generation, contentDirectory: generation.outputDirectory };
    },
    async FACT_QA(candidate, context) {
      const evidence = JSON.parse(await readFile(path.join(context.contentDirectory, "evidence.json"), "utf8"));
      const criticalFact = ["VERIFIED", "VERIFIED_DB", "NOT_REQUIRED"].includes(evidence.status) ? "VERIFIED" : "UNVERIFIED";
      return {
        ...context,
        evidence,
        gates: { ...context.gates, criticalFact, sourceConflict: evidence.conflicts?.length ? "PRESENT" : "NONE", criticalUnverifiedClaim: criticalFact === "VERIFIED" ? "NONE" : "PRESENT" },
        holdSignals: { ...context.holdSignals, SOURCE_CONFLICT: Boolean(evidence.conflicts?.length), CRITICAL_CLAIM_UNVERIFIED: criticalFact !== "VERIFIED" }
      };
    },
    async CONTENT_GENERATION(candidate, context) {
      return context;
    },
    async VISUAL_PLANNING(candidate, context) {
      const imagePlan = JSON.parse(await readFile(path.join(context.contentDirectory, "image-plan.json"), "utf8"));
      return { ...context, imagePlan };
    },
    async ASSET_GENERATION_OR_SELECTION(candidate, context) {
      const imageRequest = await runScript(path.join("images", "generate-images.mjs"), ["--content-dir", context.contentDirectory, "--mode", "prepare"]);
      const assetExecution = await runScript(path.join("images", "asset-executor.mjs"), ["--content-dir", context.contentDirectory]);
      if (assetExecution.status === "BLOCKED_SYSTEM") return { ...context, imageRequest, assetExecution, systemBlock: { reason: assetExecution.reason, resumeFrom: "ASSET_GENERATION_OR_SELECTION" } };
      if (assetExecution.status === "HOLD_CONTENT") return { ...context, imageRequest, assetExecution, holdSignals: { ...context.holdSignals, [assetExecution.reason]: true } };
      const imageResult = JSON.parse(await readFile(path.join(context.contentDirectory, "image-result.json"), "utf8"));
      return { ...context, imageRequest, assetExecution, imageResult };
    },
    async CONTENT_QA(candidate, context) {
      let qa = JSON.parse(await readFile(path.join(context.contentDirectory, "qa.json"), "utf8"));
      let contentRepair = null;
      if (qa.status !== "READY_FOR_REVIEW") {
        contentRepair = await repairContentDirectory(context.contentDirectory, 2);
        if (contentRepair.status === "PASS") qa = contentRepair.qa;
      }
      const pass = qa.status === "READY_FOR_REVIEW" && qa.checks?.unsupportedClaims === 0 && qa.checks?.subjectDrift === true;
      return {
        ...context,
        qa,
        contentRepair,
        gates: { ...context.gates, duplicateIntentGate: qa.checks?.postGenerationDuplicate?.status === "CONTENT_DUPLICATE" ? "FAIL" : "PASS", contentQa: pass ? "PASS" : "FAIL", unsupportedNumericClaim: qa.checks?.unsupportedClaims === 0 ? "NONE" : "PRESENT", unsupportedServiceLimit: qa.checks?.unsupportedClaims === 0 ? "NONE" : "PRESENT", mandatoryHumanReview: "NONE" },
        holdSignals: { ...context.holdSignals, UNRESOLVED_DUPLICATE: qa.checks?.postGenerationDuplicate?.status === "CONTENT_DUPLICATE", UNRESOLVED_SUBJECT_DRIFT: qa.checks?.subjectDrift !== true, FACT_QA_FAILED: !pass }
      };
    },
    async IMAGE_QA(candidate, context) {
      const pass = context.imageResult?.status === "READY_FOR_VISUAL_REVIEW" && context.imageResult.assets?.every((asset) => asset.status === "PASS");
      return {
        ...context,
        gates: { ...context.gates, imageQa: pass ? "PASS" : "FAIL", safetyQa: pass ? "PASS" : "FAIL", technicalMisrepresentation: pass ? "NONE" : "UNKNOWN", productModelMismatch: pass ? "NONE" : "UNKNOWN" },
        holdSignals: { ...context.holdSignals, IMAGE_QA_FAILED: !pass, SAFETY_UNCERTAINTY: !pass }
      };
    },
    async PUBLISH(candidate, context) {
      const approvalPath = path.join(context.contentDirectory, "publish-approval.json");
      if (!existsSync(approvalPath)) {
        const bodyPlans = context.imagePlan.bodyImages ?? [];
        const approval = {
          status: "APPROVED",
          mode: "AUTO_CLEARANCE",
          topicKey: candidate.topic_key,
          text: { status: "APPROVED", gate: "CONTENT_QA_PASS" },
          images: context.imageResult.assets.map((asset) => {
            const bodyIndex = asset.type === "body" ? Number(asset.id.slice("body-".length)) - 1 : null;
            const plan = bodyIndex === null ? context.imagePlan[asset.type] : bodyPlans[bodyIndex];
            return { id: asset.id, status: "APPROVED", sourceType: context.imageRequest.assets.find((item) => item.id === asset.id)?.sourceSelection?.sourceType ?? "UNKNOWN", sourceAsset: context.imageRequest.assets.find((item) => item.id === asset.id)?.sourceSelection?.sourceAsset ?? null, file: asset.file, ...(asset.type === "body" ? { alt: plan?.description ?? `${candidate.topic} 교육용 이미지`, caption: plan?.description ?? undefined } : {}) };
          })
        };
        await writeFile(approvalPath, `${JSON.stringify(approval, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
      }
      const approval = await readRuntimeJson(context.contentDirectory, "publish-approval.json");
      await synchronizePublishArtifacts(context.contentDirectory, { required: true, risk: { classification: context.classification, gates: context.gates, autoClearance: context.record.autoClearance }, approval: { status: approval.status, mode: approval.mode, text: approval.text } });
      const restored = await runScript("topic-registry.mjs", ["--operation", "restore-topic-for-retry-hold", "--topic-key", candidate.topic_key]);
      if (restored.to === "GENERATING") await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "REVIEW_REQUIRED"]);
      if (["GENERATING", "REVIEW_REQUIRED"].includes(restored.to)) await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "APPROVED"]);
      return runScript("publish-content.mjs", ["--content-dir", context.contentDirectory, "--mode", "publish"]);
    },
    async PRODUCTION_QA(candidate, context) {
      if (context.publish.status !== "PUBLISHED") return { status: "FAIL" };
      return runScriptWithQaStatus("production-content-qa.mjs", ["--content-dir", context.contentDirectory]);
    }
  };
}

async function readPreviousRecords(batchFile) {
  if (!existsSync(batchFile)) return {};
  const batch = JSON.parse(await readFile(batchFile, "utf8"));
  return Object.fromEntries((batch.records ?? []).map((record) => {
    const normalized = normalizeProductionQaRecord(normalizeLegacyRetryHoldPublishRecord(record));
    return [normalized.originalTopicKey, normalized];
  }));
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const target = Number(args.target);
  const dryRun = args["dry-run"] === "true";
  const mode = args.mode ?? (dryRun ? "dry-run" : "production");
  if (!Number.isInteger(target) || target < 1 || !["dry-run", "production"].includes(mode)) throw new Error("--target and --mode dry-run|production are required");
  if (mode === "production" && dryRun) throw new Error("MODE_CONFLICT");
  const maxCandidates = Number(args["max-candidates"] ?? Math.max(target * 3, target + 10));
  const batchId = args["batch-id"] ?? `target-${target}`;
  const batchDirectory = path.join(projectDirectory, "content-work", "autonomous-batches");
  const batchFile = path.join(batchDirectory, `${batchId}.json`);
  await loadLocalEnvironment();
  const retryHold = args["retry-hold"] === "true";
  const retrySystem = args["retry-system"] === "true";
  const reconcileOnly = args["reconcile-only"] === "true";
  if (!dryRun) {
    const preflight = await evaluateCapabilities({ retryHold, retrySystem });
    if (preflight.status !== "READY") {
      console.log(JSON.stringify({ status: "BATCH_PREFLIGHT_BLOCKED", batchId, target, mutation: "NONE", preflight, batchFile: null }, null, 2));
      return;
    }
  }
  const previousRecords = dryRun ? {} : await readPreviousRecords(batchFile);
  const resumeTopicKeys = Object.values(previousRecords).filter((record) => record.state === "PUBLISHED_PENDING_QA" || retrySystem && record.state === "BLOCKED_SYSTEM" || retryHold && ["HOLD", "HOLD_CONTENT"].includes(record.state)).map((record) => record.originalTopicKey);
  const inputs = await loadProductionInputs(maxCandidates, resumeTopicKeys);
  const candidates = reconcileOnly ? inputs.candidates.filter((candidate) => previousRecords[candidate.topic_key]?.state === "PUBLISHED_PENDING_QA") : inputs.candidates;
  const { publishedContents } = inputs;
  const checkpoints = { ...previousRecords };
  if (!dryRun) await mkdir(batchDirectory, { recursive: true });
  const onRecord = dryRun ? null : async (candidate, record, progress) => {
    try {
      if (!record.skipped && record.state === "DROP" && !candidate.generated_candidate) {
        await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "DUPLICATE"]);
      } else if (!record.skipped && ["HOLD", "HOLD_CONTENT"].includes(record.state)) {
        await runScript("topic-registry.mjs", ["--operation", "record-automation-error", "--topic-key", candidate.topic_key, "--error", record.history.at(-1)?.reason ?? "AUTONOMOUS_HOLD"]);
        await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "BLOCKED"]);
      }
    } catch (error) {
      record.registryCheckpoint = { status: "FAILED", error: error instanceof Error ? error.message : String(error) };
    }
    checkpoints[candidate.topic_key] = record;
    await writeFile(batchFile, `${JSON.stringify({ status: record.state === "BLOCKED_SYSTEM" ? "BLOCKED_SYSTEM" : "IN_PROGRESS", batchId, target, maxCandidates, published: progress.publishedCount, considered: progress.considered, currentCandidate: candidate.topic_key, checkpoint: record.checkpoint ?? null, records: Object.values(checkpoints) }, null, 2)}\n`, "utf8");
  };
  const result = await runAutonomousBatch({ batchId, target, maxCandidates, candidates, publishedContents, previousRecords, retryHold, retrySystem, dryRun, classifyTopicRisk, stages: dryRun ? {} : createProductionStages(), onRecord });
  if (!dryRun) {
    await writeFile(batchFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({ ...result, batchFile: dryRun ? null : batchFile }, null, 2));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export { createProductionStages, isLegacyRetryHoldPublishFailure, normalizeLegacyRetryHoldPublishRecord, normalizeProductionQaRecord, verifyPublishedContentForProductionQaResume };
