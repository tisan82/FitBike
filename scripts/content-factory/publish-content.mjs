import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

async function loadLocalEnvironment(projectDirectory) {
  const envPath = path.join(projectDirectory, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of (await readFile(envPath, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()] !== undefined) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function normalizeSubject(text, partType) {
  const rules = {
    TIRE: [
      ["TIRE_PRESSURE", ["공기압", "tire pressure"]],
      ["TIRE_WEAR", ["마모", "tread wear"]],
      ["TIRE_CRACK", ["균열", "갈라짐", "crack"]],
      ["TIRE_POSITION", ["앞·뒤", "앞뒤", "front/rear", "front rear"]],
      ["TIRE_TUBE_TYPE", ["tl", "tt", "튜브리스", "튜브 타입", "tube type"]],
      ["TIRE_LOAD_INDEX", ["하중지수", "하중 지수", "load index"]],
      ["TIRE_SPEED_RATING", ["속도등급", "속도 등급", "speed rating"]],
      ["TIRE_CONSTRUCTION", ["레디얼", "바이어스", "radial", "bias"]],
      ["TIRE_SIZE", ["규격", "사이즈", "표기", "size"]]
    ],
    BATTERY: [
      ["BATTERY_TERMINAL", ["단자", "terminal"]],
      ["BATTERY_DIMENSION", ["장착 공간", "크기", "치수", "dimension"]],
      ["BATTERY_CAPACITY", ["용량", "capacity", "ah"]],
      ["BATTERY_CONDITION", ["외관", "변형", "손상", "오염", "condition"]]
    ],
    BRAKE: [
      ["BRAKE_PAD_WEAR", ["패드 마모", "pad wear"]],
      ["BRAKE_PAD_POSITION", ["앞·뒤", "앞뒤", "front/rear", "front rear"]],
      ["BRAKE_PAD_STRUCTURE", ["구조", "역할", "structure"]],
      ["BRAKE_PAD_SIZE", ["패드 규격", "패드 크기", "pad size"]]
    ]
  };
  return rules[partType]?.find(([, terms]) => includesAny(text, terms))?.[0] ?? partType ?? "GENERAL";
}

function normalizeIntent({ title, summary = "", contentType, targetPart = null, targetBikeModelKey = null }) {
  const text = `${title} ${summary}`.normalize("NFKC").toLowerCase();
  const normalizedPart = targetPart
    ?? (includesAny(text, ["타이어", "tire"]) ? "TIRE" : null)
    ?? (includesAny(text, ["배터리", "battery"]) ? "BATTERY" : null)
    ?? (includesAny(text, ["브레이크", "brake"]) ? "BRAKE" : null);
  const subject = normalizeSubject(text, normalizedPart);
  let action = "UNDERSTAND";
  if (includesAny(text, ["교체 후", "교환 후", "after replacement", "post-replacement"])) action = "POST_REPLACEMENT_CHECK";
  else if (includesAny(text, ["교체", "교환", "replace"])) action = "REPLACE";
  else if (includesAny(text, ["점검", "진단", "상태 확인", "inspect"])) action = "INSPECT";
  else if (includesAny(text, ["선택", "고르는", "choose", "select"])) action = "SELECT";
  else if (includesAny(text, ["관리", "유지", "maintenance"])) action = "MAINTAIN";
  else if (contentType === "MAINTENANCE" && includesAny(text, ["확인 방법", "확인하는 법", "how to check"])) action = "INSPECT";
  const scope = targetBikeModelKey ? "MODEL" : "GENERIC";
  return { subject, action, contentType, targetPart: normalizedPart, targetBikeModelKey, scope, searchIntent: `${scope}:${subject}:${action}` };
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key])]));
  }
  return value;
}

function sameJson(left, right) {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right));
}

function validateApproval(contentDirectory, packageWithImages, approval) {
  if (packageWithImages.qa.status !== "READY_FOR_REVIEW" || approval.status !== "APPROVED" || approval.text?.status !== "APPROVED") throw new Error("PUBLISH_BLOCKED_APPROVAL_MISSING");
  if (packageWithImages.imageCandidates.status !== "READY_FOR_VISUAL_REVIEW") throw new Error("PUBLISH_BLOCKED_REQUIRED_IMAGE_MISSING");
  const requiredIds = [
    ...(packageWithImages.images.thumbnail?.required ? ["thumbnail"] : []),
    ...(packageWithImages.images.hero?.required ? ["hero"] : []),
    ...packageWithImages.images.bodyImages.flatMap((plan, index) => plan.required ? [`body-${String(index + 1).padStart(2, "0")}`] : [])
  ];
  const requiredAssets = packageWithImages.imageCandidates.assets.filter((asset) => requiredIds.includes(asset.id) && asset.status === "PASS");
  if (requiredAssets.length !== requiredIds.length || requiredIds.some((id) => requiredAssets.filter((asset) => asset.id === id).length !== 1)) throw new Error("PUBLISH_BLOCKED_REQUIRED_IMAGE_MISSING");
  for (const asset of requiredAssets) {
    const approved = approval.images.find((item) => item.id === asset.id && item.status === "APPROVED" && item.file === asset.file);
    if (!approved || !existsSync(path.join(contentDirectory, asset.file))) throw new Error("PUBLISH_BLOCKED_APPROVAL_MISSING");
    if (asset.type === "body" && (typeof approved.alt !== "string" || approved.alt.trim().length === 0)) throw new Error("PUBLISH_BLOCKED_BODY_IMAGE_ALT_MISSING");
  }
  return requiredAssets.map((asset) => ({ ...asset, approval: approval.images.find((item) => item.id === asset.id) }));
}

function productionImagePath(contentKey, asset) {
  if (asset.type === "thumbnail") return `contents/${contentKey}/thumbnail.webp`;
  if (asset.type === "hero") return `contents/${contentKey}/hero.webp`;
  if (asset.type === "body" && /^body-\d{2}$/.test(asset.id)) return `contents/${contentKey}/${asset.id}.webp`;
  throw new Error("PUBLISH_BLOCKED_IMAGE_ROLE_INVALID");
}

function meaningfulTokens(text) {
  const ignored = new Set(["이미지", "시각", "자료", "일반적인", "보여주는", "텍스트", "수치", "없이", "교육용", "개념", "purpose", "visual"]);
  return [...new Set(text.normalize("NFKC").toLowerCase().match(/[가-힣a-z0-9]+/g) ?? [])].filter((token) => token.length >= 2 && !ignored.has(token));
}

function findBodyPlacement(blocks, plan) {
  if (Number.isInteger(plan.afterBlock) && plan.afterBlock >= 0 && plan.afterBlock < blocks.length) return plan.afterBlock + 1;
  const headings = blocks.map((block, index) => block.type === "heading" ? { index, text: block.text } : null).filter(Boolean);
  if (typeof plan.targetSection === "string") {
    const target = headings.find((heading) => heading.text.includes(plan.targetSection) || plan.targetSection.includes(heading.text));
    if (target) return headings.find((heading) => heading.index > target.index)?.index ?? blocks.length;
  }
  const tokens = meaningfulTokens(`${plan.description ?? ""} ${plan.purpose ?? ""}`);
  let best = { score: -1, end: blocks.length };
  for (let index = 0; index < headings.length; index += 1) {
    const start = headings[index].index;
    const end = headings[index + 1]?.index ?? blocks.length;
    const sectionText = blocks.slice(start, end).map((block) => [block.text, block.title, block.body, ...(block.items ?? [])].filter(Boolean).join(" ")).join(" ").normalize("NFKC").toLowerCase();
    const score = tokens.filter((token) => sectionText.includes(token)).length;
    if (score >= best.score) best = { score, end };
  }
  return best.end;
}

function integrateBodyImages(content, imagePlan, approvedAssets) {
  const bodyAssets = approvedAssets.filter((asset) => asset.type === "body").sort((left, right) => left.id.localeCompare(right.id));
  if (bodyAssets.length !== imagePlan.bodyImages.filter((plan) => plan.required).length) throw new Error("PUBLISH_BLOCKED_BODY_IMAGE_COUNT_MISMATCH");
  const insertions = bodyAssets.map((asset) => {
    const index = Number(asset.id.slice("body-".length)) - 1;
    const plan = imagePlan.bodyImages[index];
    if (!plan?.required) throw new Error("PUBLISH_BLOCKED_BODY_IMAGE_PLAN_MISMATCH");
    const block = { type: "image", storagePath: productionImagePath(content.contentKey, asset), alt: asset.approval.alt.trim() };
    if (typeof asset.approval.caption === "string" && asset.approval.caption.trim()) block.caption = asset.approval.caption.trim();
    return { position: findBodyPlacement(content.bodyBlocks, plan), block };
  });
  const bodyBlocks = [...content.bodyBlocks];
  for (const insertion of insertions.sort((left, right) => right.position - left.position)) bodyBlocks.splice(insertion.position, 0, insertion.block);
  if (bodyBlocks.filter((block) => block.type === "image").length !== bodyAssets.length) throw new Error("PUBLISH_BLOCKED_BODY_IMAGE_COUNT_MISMATCH");
  return { ...content, bodyBlocks };
}

function validateRelations(relations) {
  if (!Array.isArray(relations.bikeModels) || !Array.isArray(relations.bikeModelYears) || !Array.isArray(relations.parts)) throw new Error("PUBLISH_BLOCKED_RELATION_INVALID");
  for (const part of relations.parts) {
    if (!["TIRE", "BATTERY", "BRAKE"].includes(part.partType) || part.scopeType !== "CATEGORY") throw new Error("PUBLISH_BLOCKED_RELATION_INVALID");
  }
}

async function managementRequest(projectRef, accessToken, endpoint, options = {}) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(options.headers ?? {}) }
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`Supabase management request failed (${response.status})`);
  return responseText ? JSON.parse(responseText) : null;
}

async function queryDatabase(projectRef, accessToken, query, parameters = [], readOnly = true) {
  return managementRequest(projectRef, accessToken, "/database/query", { method: "POST", body: JSON.stringify({ query, parameters, read_only: readOnly }) });
}

async function getServiceRoleKey(projectRef, accessToken) {
  const keys = await managementRequest(projectRef, accessToken, "/api-keys");
  const serviceKey = keys.find((key) => key.name === "service_role" || key.type === "service_role")?.api_key;
  if (!serviceKey) throw new Error("WRITE_ACCESS_UNAVAILABLE_STORAGE");
  return serviceKey;
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function inspectStorage(storage, bucketName, objectPath, localPath) {
  const { data: buckets, error: bucketError } = await storage.listBuckets();
  if (bucketError) throw new Error("WRITE_ACCESS_UNAVAILABLE_STORAGE");
  const bucketExists = buckets.some((bucket) => bucket.name === bucketName);
  let objectStatus = "ABSENT";
  let httpStatus = null;
  let mimeType = null;
  if (bucketExists) {
    const { data, error } = await storage.from(bucketName).download(objectPath);
    if (!error && data) {
      const remoteHash = createHash("sha256").update(Buffer.from(await data.arrayBuffer())).digest("hex");
      const localHash = await sha256File(localPath);
      objectStatus = remoteHash === localHash ? "REUSE" : "CONFLICT";
      const publicUrl = storage.from(bucketName).getPublicUrl(objectPath).data.publicUrl;
      const response = await fetch(publicUrl, { method: "HEAD" });
      httpStatus = response.status;
      mimeType = response.headers.get("content-type");
    }
  }
  return { bucketExists, objectStatus, httpStatus, mimeType };
}

function mapExistingIntent(row) {
  return normalizeIntent({ title: row.title, summary: row.summary, contentType: row.content_type, targetPart: row.part_types?.[0] ?? null, targetBikeModelKey: row.model_keys?.[0] ?? null });
}

async function duplicatePreflight(readDb, content, relations, normalizedIntent, productionAssets) {
  const rows = await readDb(`
    select c.content_id,c.content_key,c.title,c.summary,c.content_type,c.thumbnail_image_storage_path,c.hero_image_storage_path,c.body_blocks,c.is_active,c.published_at,
      coalesce(array_agg(distinct p.part_type) filter (where p.part_type is not null), '{}') as part_types,
      coalesce(array_agg(distinct b.model_key) filter (where b.model_key is not null), '{}') as model_keys
    from public."12_content" c
    left join public."15_content_part_link" p on p.content_id=c.content_id and p.is_active=true
    left join public."13_content_bike_model" cb on cb.content_id=c.content_id
    left join public."02_bike_model" b on b.bike_model_id=cb.bike_model_id
    where c.is_active=true
    group by c.content_id,c.content_key,c.title,c.summary,c.content_type,c.thumbnail_image_storage_path,c.hero_image_storage_path,c.body_blocks,c.is_active,c.published_at;`);
  const exact = rows.find((row) => row.content_key === content.contentKey);
  if (exact) {
    const expectedParts = relations.parts.map((part) => part.partType).sort();
    const actualParts = [...new Set(exact.part_types ?? [])].sort();
    const expectedThumbnail = productionAssets.find((asset) => asset.type === "thumbnail")?.objectPath ?? null;
    const expectedHero = productionAssets.find((asset) => asset.type === "hero")?.objectPath ?? null;
    const equivalent = exact.title === content.title
      && exact.summary === content.summary
      && exact.content_type === content.contentType
      && exact.thumbnail_image_storage_path === expectedThumbnail
      && exact.hero_image_storage_path === expectedHero
      && sameJson(exact.body_blocks, content.bodyBlocks)
      && exact.is_active
      && exact.published_at
      && sameJson(actualParts, expectedParts);
    return equivalent ? { status: "ALREADY_PUBLISHED", existing: exact } : { status: "PARTIAL_STATE", existing: exact };
  }
  for (const row of rows) {
    const existingIntent = mapExistingIntent(row);
    const sameEntity = existingIntent.scope === normalizedIntent.scope && existingIntent.targetPart === normalizedIntent.targetPart && existingIntent.targetBikeModelKey === normalizedIntent.targetBikeModelKey;
    if (sameEntity && existingIntent.subject === normalizedIntent.subject && existingIntent.action === normalizedIntent.action && row.content_type === content.contentType) {
      return { status: "PUBLISH_BLOCKED_DUPLICATE", duplicateWith: row.content_key };
    }
  }
  if (relations.parts.length === 0) throw new Error("PUBLISH_BLOCKED_RELATION_INVALID");
  return { status: "DISTINCT_CONTENT" };
}

async function verifyPublished(readDb, contentKey, expectedPart) {
  const rows = await readDb(`select c.content_id,c.content_key,c.title,c.thumbnail_image_storage_path,c.hero_image_storage_path,c.body_blocks,c.is_active,c.published_at,p.part_type,p.scope_type from public."12_content" c left join public."15_content_part_link" p on p.content_id=c.content_id and p.is_active=true where c.content_key=$1;`, [contentKey]);
  if (rows.length !== 1 || !rows[0].is_active || !rows[0].published_at || rows[0].part_type !== expectedPart.partType || rows[0].scope_type !== expectedPart.scopeType) throw new Error("PRODUCTION_DB_VERIFY_FAILED");
  return rows[0];
}

async function validateRegistryTopic(readDb, topicKey, content, duplicateStatus) {
  if (!topicKey) throw new Error("PUBLISH_BLOCKED_REGISTRY_TOPIC_MISSING");
  const rows = await readDb(`select t.content_topic_id,t.topic_key,t.topic,t.content_type,t.part_type,t.normalized_subject,t.normalized_action,t.normalized_scope,t.status,t.content_id,c.content_key from public."16_content_topic" t left join public."12_content" c on c.content_id=t.content_id where t.topic_key=$1`, [topicKey]);
  if (rows.length !== 1) throw new Error("PUBLISH_BLOCKED_REGISTRY_TOPIC_MISSING");
  const topic = rows[0];
  if (duplicateStatus === "ALREADY_PUBLISHED") {
    if (topic.status !== "PUBLISHED" || topic.content_key !== content.contentKey) throw new Error("PUBLISH_BLOCKED_REGISTRY_STATE");
  } else if (topic.status !== "APPROVED" || topic.content_id !== null) {
    throw new Error("PUBLISH_BLOCKED_REGISTRY_STATE");
  }
  return topic;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args["content-dir"] || !["preflight", "publish"].includes(args.mode)) throw new Error("--content-dir and --mode preflight|publish are required");
  const contentDirectory = path.resolve(args["content-dir"]);
  await loadLocalEnvironment(projectDirectory);
  const packageWithImages = await readJson(path.join(contentDirectory, "content-package-with-images.json"));
  const relations = await readJson(path.join(contentDirectory, "relations.json"));
  const plan = await readJson(path.join(contentDirectory, "plan.json"));
  const approval = await readJson(path.join(contentDirectory, "publish-approval.json"));
  const approvedAssets = validateApproval(contentDirectory, packageWithImages, approval);
  const productionAssets = approvedAssets.map((asset) => ({ ...asset, objectPath: productionImagePath(packageWithImages.content.contentKey, asset), localPath: path.join(contentDirectory, asset.file) }));
  if (new Set(productionAssets.map((asset) => asset.objectPath)).size !== productionAssets.length) throw new Error("PUBLISH_BLOCKED_STORAGE_PATH_CONFLICT");
  const publishContent = integrateBodyImages(packageWithImages.content, packageWithImages.images, productionAssets);
  validateRelations(relations);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!url || !accessToken) throw new Error("WRITE_ACCESS_UNAVAILABLE");
  const projectRef = new URL(url).hostname.split(".")[0];
  const serviceRoleKey = await getServiceRoleKey(projectRef, accessToken);
  const serviceClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const storage = serviceClient.storage;
  const readDb = (query, parameters = []) => queryDatabase(projectRef, accessToken, query, parameters, true);
  const normalizedIntent = plan.normalizedIntent ?? normalizeIntent({ title: publishContent.title, summary: publishContent.summary, contentType: publishContent.contentType, targetPart: relations.parts[0]?.partType ?? null, targetBikeModelKey: relations.bikeModels[0]?.modelKey ?? null });
  const duplicate = await duplicatePreflight(readDb, publishContent, relations, normalizedIntent, productionAssets);
  if (duplicate.status === "PUBLISH_BLOCKED_DUPLICATE") throw new Error(`PUBLISH_BLOCKED_DUPLICATE:${duplicate.duplicateWith}`);
  if (duplicate.status === "PARTIAL_STATE") throw new Error("PARTIAL_STATE");
  const registryTopic = await validateRegistryTopic(readDb, approval.topicKey, publishContent, duplicate.status);

  const bucketName = "content-assets";
  const storageAssets = [];
  for (const asset of productionAssets) {
    const inspection = await inspectStorage(storage, bucketName, asset.objectPath, asset.localPath);
    if (inspection.objectStatus === "CONFLICT") throw new Error(`PUBLISH_BLOCKED_ASSET_CONFLICT:${asset.objectPath}`);
    storageAssets.push({ id: asset.id, type: asset.type, objectPath: asset.objectPath, ...inspection });
  }
  const preflight = { status: "PASS", approval: "PASS", duplicate: duplicate.status, registry: { topicKey: registryTopic.topic_key, status: registryTopic.status }, storage: { assets: storageAssets }, contentKey: publishContent.contentKey };
  if (args.mode === "preflight") {
    await writeFile(path.join(contentDirectory, "publish-preflight.json"), `${JSON.stringify(preflight, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(preflight, null, 2));
    return;
  }

  let bucketCreated = false;
  const uploads = [];
  if (storageAssets.some((asset) => !asset.bucketExists)) {
    const { error } = await storage.createBucket(bucketName, { public: true, allowedMimeTypes: ["image/webp"] });
    if (error) throw new Error("STORAGE_BUCKET_CREATE_FAILED");
    bucketCreated = true;
  }
  for (const asset of productionAssets) {
    const before = storageAssets.find((stored) => stored.id === asset.id);
    const upload = before.objectStatus === "REUSE" ? "REUSED" : "UPLOADED";
    if (before.objectStatus === "ABSENT") {
      const { error } = await storage.from(bucketName).upload(asset.objectPath, await readFile(asset.localPath), { contentType: "image/webp", upsert: false });
      if (error) throw new Error(`STORAGE_UPLOAD_FAILED:${asset.objectPath}`);
    }
    const verified = await inspectStorage(storage, bucketName, asset.objectPath, asset.localPath);
    if (verified.objectStatus !== "REUSE" || verified.httpStatus !== 200 || verified.mimeType !== "image/webp") throw new Error(`STORAGE_VERIFY_FAILED:${asset.objectPath}`);
    uploads.push({ id: asset.id, type: asset.type, objectPath: asset.objectPath, upload, verified: true });
  }

  let dbStatus = duplicate.status;
  let storageOrphan = duplicate.status !== "ALREADY_PUBLISHED";
  try {
    if (duplicate.status !== "ALREADY_PUBLISHED") {
      const publishStatement = `
        with inserted_content as (
          insert into public."12_content" (content_key,title,summary,content_type,thumbnail_image_storage_path,hero_image_storage_path,body_blocks,is_active,published_at)
          values ($1,$2,$3,$4,$5,$6,$7::jsonb,true,$8::timestamptz)
          returning content_id
        ), inserted_bike_models as (
          insert into public."13_content_bike_model" (content_id,bike_model_id)
          select inserted_content.content_id, relation_id
          from inserted_content cross join unnest($9::bigint[]) as relation_id
        ), inserted_bike_years as (
          insert into public."14_content_bike_model_year" (content_id,bike_model_year_id)
          select inserted_content.content_id, relation_id
          from inserted_content cross join unnest($10::bigint[]) as relation_id
        ), inserted_parts as (
          insert into public."15_content_part_link" (content_id,part_type,scope_type,display_order,is_active)
          select inserted_content.content_id, relation.part_type, relation.scope_type, relation.display_order, true
          from inserted_content cross join jsonb_to_recordset($11::jsonb) as relation(part_type text,scope_type text,display_order integer)
        ), published_topic as (
          update public."16_content_topic"
          set status='PUBLISHED',content_id=(select content_id from inserted_content)
          where topic_key=$12 and status='APPROVED' and content_id is null
          returning content_topic_id
        )
        select content_id,(select count(*) from published_topic) as published_topic_count from inserted_content;`;
      const inserted = await queryDatabase(projectRef, accessToken, publishStatement, [
        publishContent.contentKey,
        publishContent.title,
        publishContent.summary,
        publishContent.contentType,
        productionAssets.find((asset) => asset.type === "thumbnail")?.objectPath ?? null,
        productionAssets.find((asset) => asset.type === "hero")?.objectPath ?? null,
        JSON.stringify(publishContent.bodyBlocks),
        new Date().toISOString(),
        relations.bikeModels.map((relation) => relation.bikeModelId),
        relations.bikeModelYears.map((relation) => relation.bikeModelYearId),
        JSON.stringify(relations.parts.map((relation, index) => ({ part_type: relation.partType, scope_type: relation.scopeType, display_order: index }))),
        approval.topicKey
      ], false);
      if (inserted.length !== 1 || Number(inserted[0].published_topic_count) !== 1) throw new Error("DB_WRITE_FAILED:content or registry topic not returned");
      dbStatus = "INSERTED";
    }
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : "DB_WRITE_FAILED"};STORAGE_ORPHAN=${storageOrphan}`);
  }
  const verifiedRow = await verifyPublished(readDb, publishContent.contentKey, relations.parts[0]);
  storageOrphan = false;
  const result = { status: "PUBLISHED", contentKey: publishContent.contentKey, approval: "PASS", duplicateSafety: "PASS", idempotency: duplicate.status, storage: { bucket: bucketName, bucketCreated, assets: uploads }, database: { content: dbStatus, partRelation: "VERIFIED", contentId: verifiedRow.content_id, bodyImageBlocks: publishContent.bodyBlocks.filter((block) => block.type === "image").length }, storageOrphan };
  await writeFile(path.join(contentDirectory, "publish-result.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export { findBodyPlacement, integrateBodyImages, productionImagePath, validateApproval };
