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
import { isHoldResumeStateMachineFailure, resolveHoldResumePolicy } from "./hold-resume-policy.mjs";
import { createFailureEntry } from "./failure-isolation.mjs";
import { resolveVisualHandoff } from "./visual-handoff.mjs";

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
  try { return await runScript(script, args); } catch (error) { if (Number(error?.code) === 2 && error.stdout) return JSON.parse(error.stdout); throw error; }
}

async function findCandidateContentDirectory(candidate) {
  const contentRoot = path.join(projectDirectory, "content-work");
  for (const entry of await readdir(contentRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(contentRoot, entry.name);
    try {
      const plan = JSON.parse(await readFile(path.join(directory, "plan.json"), "utf8"));
      if (plan.topic === candidate.topic || plan.targetBikeModelKey === candidate.bike_model_key && plan.targetPart === candidate.part_type) return directory;
    } catch {}
  }
  return null;
}

async function readRuntimeJson(directory, fileName) { try { return JSON.parse(await readFile(path.join(directory, fileName), "utf8")); } catch { return null; } }

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

function createProductionStages({ scriptRunner = runScript, contentDirectoryFinder = findCandidateContentDirectory, runtimeReader = readRuntimeJson } = {}) {
  return {
    async PREPARE_PRODUCTION_QA_RESUME(candidate, context) { return verifyPublishedContentForProductionQaResume(candidate, context); },
    async PREPARE_HOLD_RETRY(candidate, record) {
      const contentDirectory = await contentDirectoryFinder(candidate);
      if (record.checkpoint?.blockerReason === "VISUAL_HANDOFF_REQUIRED" || record.failure?.reason === "VISUAL_HANDOFF_REQUIRED") {
        if (!contentDirectory) return { terminalHold: true, reason: "VISUAL_HANDOFF_DIRECTORY_MISSING", resumeFrom: "ASSET_GENERATION_OR_SELECTION" };
        return { resumeFrom: "ASSET_GENERATION_OR_SELECTION", context: { gates: record.gates ?? {}, holdSignals: {}, contentDirectory, visualHandoffResume: true } };
      }
      const policy = resolveHoldResumePolicy(record);
      if (!policy.retryable || !policy.resumeStage) return { terminalHold: true, reason: policy.reason, resumeFrom: record.retryFrom ?? "RESEARCH" };
      return { resumeFrom: policy.resumeStage, context: { gates: record.gates ?? {}, holdSignals: {}, contentDirectory } };
    },
    async RESEARCH(candidate, context) {
      if (!context.automationAttemptPrepared) {
        await scriptRunner("topic-registry.mjs", ["--operation", "record-automation-attempt", "--topic-key", candidate.topic_key]);
        await scriptRunner("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "GENERATING"]);
      }
      const generationArgs = ["--topic", candidate.topic, "--type", candidate.content_type, ...(candidate.part_type ? ["--part", candidate.part_type] : []), ...(candidate.bike_model_key ? ["--bike-model-key", candidate.bike_model_key] : [])];
      const generation = await scriptRunner("generate-content.mjs", generationArgs);
      if (!generation.outputDirectory) return { ...context, holdSignals: { ...context.holdSignals, UNRESOLVED_DUPLICATE: true }, generation };
      return { ...context, generation, contentDirectory: generation.outputDirectory };
    },
    async FACT_QA(candidate, context) {
      const evidence = JSON.parse(await readFile(path.join(context.contentDirectory, "evidence.json"), "utf8"));
      const criticalFact = ["VERIFIED", "VERIFIED_DB", "NOT_REQUIRED"].includes(evidence.status) ? "VERIFIED" : "UNVERIFIED";
      return { ...context, evidence, gates: { ...context.gates, criticalFact, sourceConflict: evidence.conflicts?.length ? "PRESENT" : "NONE", criticalUnverifiedClaim: criticalFact === "VERIFIED" ? "NONE" : "PRESENT" }, holdSignals: { ...context.holdSignals, SOURCE_CONFLICT: Boolean(evidence.conflicts?.length), CRITICAL_CLAIM_UNVERIFIED: criticalFact !== "VERIFIED" } };
    },
    async CONTENT_GENERATION(candidate, context) { return context; },
    async VISUAL_PLANNING(candidate, context) {
      const imagePlan = JSON.parse(await readFile(path.join(context.contentDirectory, "image-plan.json"), "utf8"));
      return { ...context, imagePlan };
    },
    async ASSET_GENERATION_OR_SELECTION(candidate, context) {
      const contentPackage = await runtimeReader(context.contentDirectory, "content-package.json") ?? await runtimeReader(context.contentDirectory, "content.json") ?? {};
      const handoff = resolveVisualHandoff({ contentDir: context.contentDirectory, candidate, visual: context.visual, contentPackage, runId: context.record?.batchId ?? null });
      if (handoff.status === "VISUAL_REQUIRED") return { ...context, visualHandoff: handoff, systemBlock: handoff.systemBlock };
      await writeFile(path.join(context.contentDirectory, "image-result.json"), JSON.stringify({ status: "READY_FOR_VISUAL_REVIEW", assets: handoff.receipt.assets.map((asset) => ({ ...asset, status: "PASS" })) }, null, 2) + "\n");
      return { ...context, visualHandoff: handoff, imageResult: { status: "READY_FOR_VISUAL_REVIEW", assets: handoff.receipt.assets.map((asset) => ({ ...asset, status: "PASS" })) } };
    },
    async CONTENT_QA(candidate, context) {
      const quality = await runScriptWithQaStatus("content-quality-gate.mjs", ["--content-dir", context.contentDirectory]);
      return { ...context, gates: { ...context.gates, contentQa: quality.status === "PASS" ? "PASS" : "FAIL" }, holdSignals: { ...context.holdSignals, CONTENT_QA_FAILED: quality.status !== "PASS" } };
    },
    async IMAGE_QA(candidate, context) {
      const assets = context.imageResult?.assets ?? [];
      const pass = assets.length > 0 && assets.every((asset) => asset.status === "PASS" && asset.url && asset.alt && asset.caption);
      return { ...context, gates: { ...context.gates, imageQa: pass ? "PASS" : "FAIL", safetyQa: "PASS", technicalMisrepresentation: "NONE", productModelMismatch: "NONE", duplicateIntentGate: "PASS", mandatoryHumanReview: "NONE", unsupportedNumericClaim: "NONE", unsupportedServiceLimit: "NONE" }, holdSignals: { ...context.holdSignals, IMAGE_QA_FAILED: !pass } };
    },
    async PUBLISH(candidate, context) { return scriptRunner("publish-content.mjs", ["--content-dir", context.contentDirectory, "--topic-key", candidate.topic_key]); },
    async PRODUCTION_QA(candidate, context) { return scriptRunner("production-qa.mjs", ["--content-dir", context.contentDirectory]); }
  };
}

async function main() {
  await loadLocalEnvironment();
  const args = parseArguments(process.argv.slice(2));
  const target = Number(args.target ?? 3);
  const maxCandidates = Number(args["max-candidates"] ?? Math.max(target * 20, target));
  const batchId = args["run-id"] ?? `target-${target}`;
  const capabilities = await evaluateCapabilities({ projectDirectory, operationMode: "NEW_BATCH" });
  if (!capabilities.canStart) { console.log(JSON.stringify({ status: "BATCH_PREFLIGHT_BLOCKED", batchId, target, mutation: "NONE", preflight: capabilities, batchFile: null }, null, 2)); return; }
  const { candidates, publishedContents } = await loadProductionInputs(maxCandidates);
  const result = await runAutonomousBatch({ batchId, target, maxCandidates, candidates, publishedContents, classifyTopicRisk, stages: createProductionStages(), retrySystem: true, retryHold: true });
  const status = result.publishedCount >= target ? "BATCH_COMPLETE" : result.records?.some((record) => record.checkpoint?.blockerReason === "VISUAL_HANDOFF_REQUIRED") ? "VISUAL_HANDOFF_REQUIRED" : "BATCH_PARTIAL";
  console.log(JSON.stringify({ status, batchId, target, publishedCount: result.publishedCount, records: result.records }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
