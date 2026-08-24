import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { classifyTopicRisk, resolveExecutionClassification } from "./automation-policy.mjs";

const execute = promisify(execFile);
const contentFactoryDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(contentFactoryDirectory, "../..");

function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) throw new Error("INVALID_ARGUMENTS");
    args[argv[index].slice(2)] = argv[index + 1];
  }
  return args;
}

async function runScript(script, args) {
  const { stdout } = await execute(process.execPath, [path.join(contentFactoryDirectory, script), ...args], { cwd: projectDirectory, env: process.env });
  return JSON.parse(stdout);
}

function generationArguments(topic) {
  return ["--topic", topic.topic, "--type", topic.content_type, ...(topic.part_type ? ["--part", topic.part_type] : []), ...(topic.bike_model_key ? ["--bike-model-key", topic.bike_model_key] : [])];
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const dryRun = args["dry-run"] === "true";
  const selected = (await runScript("topic-registry.mjs", ["--operation", "get-next-topic"])).result;
  if (!selected) return console.log(JSON.stringify({ status: "QUEUE_EMPTY" }, null, 2));
  const runtimeClassification = classifyTopicRisk(selected);
  const classificationDecision = resolveExecutionClassification(selected, runtimeClassification);
  if (classificationDecision.status === "BLOCKED") {
    return console.log(JSON.stringify({ status: "BLOCKED", reason: classificationDecision.reason, selected, classificationDecision }, null, 2));
  }
  const classification = classificationDecision.execution;
  const expectedFlow = classification.automationLevel === "L2"
    ? ["PLANNED", "GENERATING", "QA", "IMAGE_AUTO_GATE", "APPROVED", "PUBLISHED"]
    : ["PLANNED", "GENERATING", "QA", "IMAGE", "REVIEW_REQUIRED", "USER_APPROVAL", "PUBLISHED"];
  if (dryRun) return console.log(JSON.stringify({ status: "DRY_RUN", mutation: "NONE", selected, classification, runtimeClassification, classificationDecision, expectedFlow }, null, 2));

  await runScript("topic-registry.mjs", ["--operation", "record-automation-attempt", "--topic-key", selected.topic_key]);
  await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", selected.topic_key, "--status", "GENERATING"]);
  let generation;
  try {
    generation = await runScript("generate-content.mjs", generationArguments(selected));
  } catch (error) {
    await runScript("topic-registry.mjs", ["--operation", "record-automation-error", "--topic-key", selected.topic_key, "--error", error instanceof Error ? error.message : String(error)]);
    await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", selected.topic_key, "--status", "BLOCKED"]);
    throw error;
  }
  if (["DUPLICATE_CONTENT", "DUPLICATE_REVIEW_REQUIRED"].includes(generation.status)) {
    const status = generation.status === "DUPLICATE_CONTENT" ? "DUPLICATE" : "REVIEW_REQUIRED";
    await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", selected.topic_key, "--status", status]);
    return console.log(JSON.stringify({ status, selected, classification, generation }, null, 2));
  }
  const contentDirectory = generation.outputDirectory;
  const qa = JSON.parse(await readFile(path.join(contentDirectory, "qa.json"), "utf8"));
  if (qa.status !== "READY_FOR_REVIEW") {
    await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", selected.topic_key, "--status", "REVIEW_REQUIRED"]);
    return console.log(JSON.stringify({ status: "REVIEW_REQUIRED", reason: "TEXT_QA", selected, classification, generation, qa }, null, 2));
  }
  const imageRequest = await runScript(path.join("images", "generate-images.mjs"), ["--content-dir", contentDirectory, "--mode", "prepare"]);
  await runScript("topic-registry.mjs", ["--operation", "update-topic-status", "--topic-key", selected.topic_key, "--status", "REVIEW_REQUIRED"]);
  console.log(JSON.stringify({ status: "REVIEW_REQUIRED", reason: classification.automationLevel === "L2" ? "IMAGE_AUTO_GATE_REQUIRES_APPROVED_SOURCES" : "LEVEL_1_HUMAN_REVIEW", selected, classification, generation, imageRequest }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
