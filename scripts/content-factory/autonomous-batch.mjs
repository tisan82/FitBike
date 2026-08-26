import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { classifyTopicRisk } from "./automation-policy.mjs";
import { runAutonomousBatch } from "./autonomous-batch-engine.mjs";
import { deriveModelCandidates } from "./autonomous-policy.mjs";

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

async function loadProductionInputs(maxCandidates) {
  const queuedCandidates = await managementQuery(`select t.content_topic_id,t.topic_key,t.topic,t.content_type,t.part_type,t.bike_model_id,b.model_key as bike_model_key,t.normalized_subject,t.normalized_action,t.normalized_scope,t.status,t.priority,t.automation_level,t.risk_level,t.attempt_count,t.last_error,t.content_id,t.created_at from public."16_content_topic" t left join public."02_bike_model" b on b.bike_model_id=t.bike_model_id where t.status='PLANNED' order by t.priority,t.created_at,t.content_topic_id limit $1`, [maxCandidates]);
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

function createProductionStages() {
  return {
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
      const criticalFact = evidence.status === "VERIFIED" || evidence.status === "NOT_REQUIRED" ? "VERIFIED" : "UNVERIFIED";
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
      const imageResultPath = path.join(context.contentDirectory, "image-result.json");
      if (!existsSync(imageResultPath)) return { ...context, imageRequest, holdSignals: { ...context.holdSignals, IMAGE_QA_FAILED: true } };
      return { ...context, imageRequest, imageResult: JSON.parse(await readFile(imageResultPath, "utf8")) };
    },
    async CONTENT_QA(candidate, context) {
      const qa = JSON.parse(await readFile(path.join(context.contentDirectory, "qa.json"), "utf8"));
      const pass = qa.status === "READY_FOR_REVIEW" && qa.checks?.unsupportedClaims === 0 && qa.checks?.subjectDrift === true;
      return {
        ...context,
        qa,
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
      await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "REVIEW_REQUIRED"]);
      await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "APPROVED"]);
      return runScript("publish-content.mjs", ["--content-dir", context.contentDirectory, "--mode", "publish"]);
    },
    async PRODUCTION_QA(candidate, context) {
      if (context.publish.status !== "PUBLISHED") return { status: "FAIL" };
      return runScript("production-content-qa.mjs", ["--content-dir", context.contentDirectory]);
    }
  };
}

async function readPreviousRecords(batchFile) {
  if (!existsSync(batchFile)) return {};
  const batch = JSON.parse(await readFile(batchFile, "utf8"));
  return Object.fromEntries((batch.records ?? []).map((record) => [record.originalTopicKey, record]));
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
  const { candidates, publishedContents } = await loadProductionInputs(maxCandidates);
  const previousRecords = dryRun ? {} : await readPreviousRecords(batchFile);
  const retryHold = args["retry-hold"] === "true";
  const checkpoints = { ...previousRecords };
  if (!dryRun) await mkdir(batchDirectory, { recursive: true });
  const onRecord = dryRun ? null : async (candidate, record) => {
    try {
      if (!record.skipped && record.state === "DROP" && !candidate.generated_candidate) {
        await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "DUPLICATE"]);
      } else if (!record.skipped && record.state === "HOLD") {
        await runScript("topic-registry.mjs", ["--operation", "record-automation-error", "--topic-key", candidate.topic_key, "--error", record.history.at(-1)?.reason ?? "AUTONOMOUS_HOLD"]);
        await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", candidate.topic_key, "--status", "BLOCKED"]);
      }
    } catch (error) {
      record.registryCheckpoint = { status: "FAILED", error: error instanceof Error ? error.message : String(error) };
    }
    checkpoints[candidate.topic_key] = record;
    await writeFile(batchFile, `${JSON.stringify({ status: "IN_PROGRESS", target, maxCandidates, records: Object.values(checkpoints) }, null, 2)}\n`, "utf8");
  };
  const result = await runAutonomousBatch({ target, maxCandidates, candidates, publishedContents, previousRecords, retryHold, dryRun, classifyTopicRisk, stages: dryRun ? {} : createProductionStages(), onRecord });
  if (!dryRun) {
    await writeFile(batchFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({ ...result, batchFile: dryRun ? null : batchFile }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
