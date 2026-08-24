import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const contentTypes = ["MAINTENANCE", "DIY", "PARTS_GUIDE", "MODEL_GUIDE"];
const partTypes = ["TIRE", "BATTERY", "BRAKE"];
const transitions = {
  PLANNED: ["GENERATING", "BLOCKED", "DUPLICATE", "ARCHIVED"],
  GENERATING: ["REVIEW_REQUIRED", "BLOCKED", "DUPLICATE"],
  REVIEW_REQUIRED: ["APPROVED", "BLOCKED", "DUPLICATE", "ARCHIVED"],
  APPROVED: ["PUBLISHED", "BLOCKED", "ARCHIVED"],
  BLOCKED: ["PLANNED", "GENERATING", "ARCHIVED"],
  DUPLICATE: ["ARCHIVED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: []
};

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error(`Invalid CLI argument near ${key ?? "end of input"}`);
    result[key.slice(2)] = value.trim();
  }
  return result;
}

async function loadLocalEnvironment() {
  for (const line of (await readFile(path.join(projectDirectory, ".env.local"), "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()] !== undefined) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function normalizeIntent({ topic, contentType, partType = null, bikeModelKey = null }) {
  const text = topic.normalize("NFKC").toLowerCase();
  const normalizedPart = partType
    ?? (includesAny(text, ["타이어", "tire"]) ? "TIRE" : null)
    ?? (includesAny(text, ["배터리", "battery"]) ? "BATTERY" : null)
    ?? (includesAny(text, ["브레이크", "brake"]) ? "BRAKE" : null);
  let subject = normalizedPart ?? "GENERAL";
  if (normalizedPart === "TIRE" && includesAny(text, ["규격", "사이즈", "표기", "size"])) subject = "TIRE_SIZE";
  let action = "UNDERSTAND";
  if (includesAny(text, ["교체", "교환", "replace"])) action = "REPLACE";
  else if (includesAny(text, ["점검", "진단", "상태 확인", "inspect"])) action = "INSPECT";
  else if (includesAny(text, ["선택", "고르는", "choose", "select"])) action = "SELECT";
  else if (includesAny(text, ["관리", "유지", "maintenance"])) action = "MAINTAIN";
  return { subject, action, scope: bikeModelKey ? "MODEL" : "GENERIC", contentType, partType: normalizedPart, bikeModelKey };
}

async function managementQuery(query, parameters = [], readOnly = true) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!url || !accessToken) throw new Error("REGISTRY_ACCESS_UNAVAILABLE");
  const projectRef = new URL(url).hostname.split(".")[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, parameters, read_only: readOnly })
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`REGISTRY_DB_ERROR:${response.status}:${responseText}`);
  return responseText ? JSON.parse(responseText) : [];
}

async function resolveBikeModel(bikeModelKey) {
  if (!bikeModelKey) return null;
  const rows = await managementQuery(`select bike_model_id,model_key from public."02_bike_model" where model_key=$1 and is_active=true`, [bikeModelKey]);
  if (rows.length !== 1) throw new Error("BLOCKED_BIKE_MODEL");
  return rows[0];
}

async function checkDuplicate(topicKey, topic, intent, bikeModelId) {
  const registryRows = await managementQuery(`select content_topic_id,topic_key,topic,content_type,part_type,bike_model_id,normalized_subject,normalized_action,normalized_scope,status,content_id from public."16_content_topic"`);
  const contentRows = await managementQuery(`
    select c.content_id,c.content_key,c.title,c.summary,c.content_type,
      coalesce(array_agg(distinct p.part_type) filter (where p.part_type is not null), '{}') as part_types,
      coalesce(array_agg(distinct b.model_key) filter (where b.model_key is not null), '{}') as model_keys
    from public."12_content" c
    left join public."15_content_part_link" p on p.content_id=c.content_id and p.is_active=true
    left join public."13_content_bike_model" cb on cb.content_id=c.content_id
    left join public."02_bike_model" b on b.bike_model_id=cb.bike_model_id
    where c.is_active=true
    group by c.content_id,c.content_key,c.title,c.summary,c.content_type`);
  const keyMatch = registryRows.find((row) => row.topic_key === topicKey);
  if (keyMatch) return { classification: "EXACT_DUPLICATE", duplicateWith: keyMatch.topic_key, source: "REGISTRY" };
  const intentMatch = registryRows.find((row) => row.normalized_subject === intent.subject && row.normalized_action === intent.action && row.normalized_scope === intent.scope && row.content_type === intent.contentType && row.part_type === intent.partType && row.bike_model_id === bikeModelId);
  if (intentMatch) return { classification: "EXACT_DUPLICATE", duplicateWith: intentMatch.topic_key, source: "REGISTRY" };
  for (const row of contentRows) {
    const existing = normalizeIntent({ topic: `${row.title} ${row.summary}`, contentType: row.content_type, partType: row.part_types?.[0] ?? null, bikeModelKey: row.model_keys?.[0] ?? null });
    if (existing.subject === intent.subject && existing.action === intent.action && existing.scope === intent.scope && existing.contentType === intent.contentType && existing.partType === intent.partType && existing.bikeModelKey === intent.bikeModelKey) {
      return { classification: "EXACT_DUPLICATE", duplicateWith: row.content_key, source: "CONTENT" };
    }
    const sameEntity = existing.scope === intent.scope && existing.partType === intent.partType && existing.bikeModelKey === intent.bikeModelKey;
    if (sameEntity && existing.subject === intent.subject && existing.action === intent.action) return { classification: "NEAR_DUPLICATE", duplicateWith: row.content_key, source: "CONTENT" };
  }
  return { classification: "DISTINCT", duplicateWith: null, source: null, topic };
}

async function registerTopic(args) {
  const topic = args.topic;
  const topicKey = args["topic-key"];
  const contentType = args["content-type"]?.toUpperCase();
  const partType = args["part-type"]?.toUpperCase() ?? null;
  const bikeModelKey = args["bike-model-key"] ?? null;
  const priority = Number(args.priority ?? 2);
  if (!topic || !topicKey || !contentTypes.includes(contentType) || partType && !partTypes.includes(partType) || ![1, 2, 3].includes(priority)) throw new Error("INVALID_TOPIC_INPUT");
  const bike = await resolveBikeModel(bikeModelKey);
  const intent = normalizeIntent({ topic, contentType, partType, bikeModelKey });
  const duplicate = await checkDuplicate(topicKey, topic, intent, bike?.bike_model_id ?? null);
  if (duplicate.classification === "EXACT_DUPLICATE") return { result: "DUPLICATE", intent, duplicate };
  if (duplicate.classification === "NEAR_DUPLICATE") return { result: "REVIEW_REQUIRED", intent, duplicate };
  if (args["dry-run"] === "true") return { result: "REGISTERED", dryRun: true, intent, duplicate };
  const rows = await managementQuery(`insert into public."16_content_topic" (topic_key,topic,content_type,part_type,bike_model_id,normalized_subject,normalized_action,normalized_scope,status,priority) values ($1,$2,$3,$4,$5,$6,$7,$8,'PLANNED',$9) returning content_topic_id,topic_key,status`, [topicKey, topic, contentType, intent.partType, bike?.bike_model_id ?? null, intent.subject, intent.action, intent.scope, priority], false);
  return { result: "REGISTERED", topic: rows[0] };
}

async function getNextTopic() {
  const rows = await managementQuery(`select content_topic_id,topic_key,topic,content_type,part_type,bike_model_id,normalized_subject,normalized_action,normalized_scope,status,priority,content_id,created_at from public."16_content_topic" where status='PLANNED' order by priority asc,created_at asc,content_topic_id asc limit 1`);
  return { result: rows[0] ?? null };
}

async function updateTopicStatus(args) {
  const topicKey = args["topic-key"];
  const nextStatus = args.status?.toUpperCase();
  if (!topicKey || !nextStatus) throw new Error("INVALID_STATUS_INPUT");
  const rows = await managementQuery(`select content_topic_id,topic_key,status,content_id from public."16_content_topic" where topic_key=$1`, [topicKey]);
  if (rows.length !== 1) throw new Error("TOPIC_NOT_FOUND");
  const current = rows[0];
  if (!transitions[current.status]?.includes(nextStatus)) throw new Error(`INVALID_STATUS_TRANSITION:${current.status}->${nextStatus}`);
  let contentId = current.content_id;
  if (nextStatus === "PUBLISHED") {
    if (!args["content-key"]) throw new Error("PUBLISHED_REQUIRES_CONTENT_KEY");
    const contents = await managementQuery(`select content_id from public."12_content" where content_key=$1 and is_active=true and published_at is not null`, [args["content-key"]]);
    if (contents.length !== 1) throw new Error("PUBLISHED_CONTENT_NOT_FOUND");
    contentId = contents[0].content_id;
  }
  if (args["dry-run"] === "true") return { result: "UPDATED", dryRun: true, from: current.status, to: nextStatus, contentId };
  const updated = await managementQuery(`update public."16_content_topic" set status=$2,content_id=$3 where content_topic_id=$1 returning content_topic_id,topic_key,status,content_id`, [current.content_topic_id, nextStatus, contentId], false);
  return { result: "UPDATED", topic: updated[0] };
}

async function main() {
  await loadLocalEnvironment();
  const args = parseArguments(process.argv.slice(2));
  let result;
  if (args.operation === "register-topic") result = await registerTopic(args);
  else if (args.operation === "get-next-topic") result = await getNextTopic();
  else if (args.operation === "update-topic-status") result = await updateTopicStatus(args);
  else throw new Error("--operation register-topic|get-next-topic|update-topic-status is required");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
