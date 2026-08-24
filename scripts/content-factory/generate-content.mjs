import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const factoryDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(factoryDirectory, "../..");

async function readJson(fileName) {
  return JSON.parse(await readFile(path.join(factoryDirectory, fileName), "utf8"));
}

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

async function loadLocalEnvironment() {
  const envPath = path.join(projectDirectory, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of (await readFile(envPath, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match || process.env[match[1].trim()] !== undefined) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function createContentKey(topic, slugTerms) {
  let value = topic.normalize("NFKC").toLowerCase();
  for (const [source, target] of Object.entries(slugTerms).sort(([a], [b]) => b.length - a.length)) {
    value = value.replaceAll(source.toLowerCase(), ` ${target} `);
  }
  const slug = value.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-");
  if (slug) return slug;
  return `content-${createHash("sha256").update(topic).digest("hex").slice(0, 12)}`;
}

function pressureDraft(topic) {
  return {
    title: topic,
    summary: "오토바이 타이어 공기압을 확인하기 전 준비 사항과 측정 순서, 확인 후 점검할 내용을 정리합니다.",
    blocks: [
      { type: "heading", level: 2, text: "타이어 공기압은 무엇을 기준으로 확인하나요?" },
      { type: "paragraph", text: "타이어 공기압은 임의의 수치가 아니라 바이크 제조사가 안내하는 모델과 연식별 기준을 먼저 확인한 뒤 점검해야 합니다." },
      { type: "heading", level: 2, text: "확인 전 준비" },
      { type: "bullet_list", items: ["정확한 바이크 모델과 연식 확인", "앞·뒤 타이어 권장 공기압 구분", "사용할 공기압 측정 도구 준비"] },
      { type: "heading", level: 2, text: "공기압 확인 순서" },
      { type: "step", number: 1, title: "권장 공기압 확인", body: "차량 매뉴얼이나 제조사 안내에서 현재 모델과 연식의 앞·뒤 권장 공기압을 확인합니다." },
      { type: "step", number: 2, title: "현재 상태 측정", body: "앞·뒤 타이어를 구분하고 밸브에 측정 도구를 연결해 현재 공기압을 확인합니다." },
      { type: "step", number: 3, title: "기준과 비교", body: "측정값을 확인한 권장 공기압과 비교하고 필요한 조정 여부를 판단합니다." },
      { type: "heading", level: 2, text: "측정 후 확인" },
      { type: "tip", title: "앞·뒤를 따로 기록하세요", body: "앞·뒤 권장값과 측정값을 구분해 기록하면 다음 점검 때 변화를 확인하기 쉽습니다." },
      { type: "heading", level: 2, text: "모델과 연식 확인" },
      { type: "warning", title: "임의 수치를 적용하지 마세요", body: "같은 모델명이라도 연식이나 세대에 따라 기준이 다를 수 있으므로 실제 차량의 제조사 안내를 함께 확인하세요." }
    ],
    templateStatus: "VERIFIED_TEMPLATE"
  };
}

function conservativeDraft(topic, contentType) {
  const purpose = contentType === "DIY" ? "작업" : "정보";
  return {
    title: topic,
    summary: `${topic}에 필요한 기본 확인 사항과 주의할 내용을 정리합니다.`,
    blocks: [
      { type: "heading", level: 2, text: `${topic} 전에 확인할 것` },
      { type: "paragraph", text: `정확한 대상과 현재 상태를 먼저 확인한 뒤 ${purpose}를 진행해야 합니다.` },
      { type: "heading", level: 2, text: "확인 순서" },
      { type: "numbered_list", items: ["대상 정보 확인", "현재 상태 확인", "공식 안내와 비교"] },
      { type: "heading", level: 2, text: "주의 사항" },
      { type: "warning", body: "검증되지 않은 수치나 규격을 임의로 적용하지 말고 제조사 안내와 실제 표기를 함께 확인하세요." },
      { type: "heading", level: 2, text: "검토가 필요한 내용" },
      { type: "paragraph", text: "이 초안은 구조 검토용이며 구체적인 사실이나 절차를 추가하려면 내부 근거를 먼저 확인해야 합니다." }
    ],
    templateStatus: "GENERIC_REVIEW_REQUIRED"
  };
}

function validateBlocks(blocks, validTypes) {
  const issues = [];
  if (!Array.isArray(blocks) || blocks.length === 0) return ["body_blocks must be a non-empty array"];
  blocks.forEach((block, index) => {
    if (!block || typeof block !== "object" || !validTypes.includes(block.type)) {
      issues.push(`block ${index} has an unsupported type`);
      return;
    }
    if (block.type === "heading" && (![2, 3].includes(block.level) || !block.text)) issues.push(`heading ${index} is invalid`);
    if (block.type === "paragraph" && !block.text) issues.push(`paragraph ${index} is invalid`);
    if (["bullet_list", "numbered_list"].includes(block.type) && (!Array.isArray(block.items) || block.items.length === 0 || block.items.some((item) => typeof item !== "string" || !item))) issues.push(`list ${index} is invalid`);
    if (block.type === "step" && (!block.title || !block.body)) issues.push(`step ${index} is invalid`);
    if (["tip", "warning"].includes(block.type) && !block.body) issues.push(`notice ${index} is invalid`);
    if (block.type === "table" && (!Array.isArray(block.headers) || !Array.isArray(block.rows))) issues.push(`table ${index} is invalid`);
    if (block.type === "image" && (!block.storagePath || typeof block.alt !== "string")) issues.push(`image ${index} is invalid`);
  });
  return issues;
}

async function createEvidenceReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase read-only environment is unavailable");
  const projectRef = new URL(url).hostname.split(".")[0];
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (accessToken) {
    return async (query, parameters = []) => {
      const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, parameters, read_only: true })
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Supabase evidence query failed (${response.status})`);
      return text ? JSON.parse(text) : [];
    };
  }
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (operation, parameters = []) => {
    if (operation === "DUPLICATE") {
      const [keyResult, titleResult] = await Promise.all([
        client.from("12_content").select("content_key,title").eq("content_key", parameters[0]),
        client.from("12_content").select("content_key,title").eq("title", parameters[1])
      ]);
      if (keyResult.error || titleResult.error) throw new Error("Supabase duplicate query failed");
      return [...(keyResult.data ?? []), ...(titleResult.data ?? [])];
    }
    throw new Error("Full internal evidence requires SUPABASE_ACCESS_TOKEN");
  };
}

async function main() {
  const [rules, typeRules, blockSchema] = await Promise.all([
    readJson("content-rules.json"),
    readJson("content-type-rules.json"),
    readJson("content-block-schema.json")
  ]);
  if (blockSchema.title !== "FitBike Content Blocks") throw new Error("Content block schema is invalid");
  const args = parseArguments(process.argv.slice(2));
  const topic = args.topic;
  const contentType = args.type?.toUpperCase();
  const targetPart = args.part?.toUpperCase() ?? null;
  const targetBikeModelKey = args["bike-model-key"] ?? null;
  if (!topic || !contentType) throw new Error("--topic and --type are required");
  if (!rules.validContentTypes.includes(contentType)) throw new Error(`Unsupported content type: ${contentType}`);
  if (targetPart && !rules.validPartTypes.includes(targetPart)) throw new Error(`Unsupported part type: ${targetPart}`);

  await loadLocalEnvironment();
  const contentKey = createContentKey(topic, rules.slugTerms);
  const isPressureTemplate = contentType === "MAINTENANCE" && targetPart === "TIRE" && topic.includes("타이어") && topic.includes("공기압");
  const draft = isPressureTemplate ? pressureDraft(topic) : conservativeDraft(topic, contentType);
  const plan = {
    topic,
    contentKey,
    title: draft.title,
    summary: draft.summary,
    contentType,
    targetPart,
    targetBikeModelKey,
    intent: typeRules[contentType].intent,
    sections: draft.blocks.filter((block) => block.type === "heading").map((block) => block.text),
    requiredEvidence: targetBikeModelKey || contentType === "MODEL_GUIDE" ? ["02_bike_model", "03_bike_model_year"] : [],
    imageRequirements: ["Do not place long explanatory text inside images"],
    relationRequirements: [targetPart ? `${targetPart}:CATEGORY` : null, targetBikeModelKey ? `BIKE_MODEL:${targetBikeModelKey}` : null].filter(Boolean)
  };

  const readEvidence = await createEvidenceReader();
  const duplicateQuery = process.env.SUPABASE_ACCESS_TOKEN
    ? `select content_key,title from public."12_content" where content_key=$1 or title=$2;`
    : "DUPLICATE";
  const duplicates = await readEvidence(duplicateQuery, [contentKey, draft.title]);
  if (duplicates.length > 0) throw new Error(`DUPLICATE_CONTENT: ${duplicates.map((item) => item.content_key).join(", ")}`);

  const evidence = { status: "NOT_REQUIRED", sources: [], facts: [], missing: [] };
  const relations = { bikeModels: [], bikeModelYears: [], parts: targetPart ? [{ partType: targetPart, scopeType: "CATEGORY" }] : [] };
  if (contentType === "MODEL_GUIDE" && !targetBikeModelKey) evidence.missing.push("targetBikeModelKey");
  if (targetBikeModelKey) {
    try {
      const bikes = await readEvidence(`select bike_model_id,model_key,model_name_en,model_name_ko from public."02_bike_model" where model_key=$1 and is_active=true;`, [targetBikeModelKey]);
      if (bikes.length !== 1) evidence.missing.push(`active bike model: ${targetBikeModelKey}`);
      else {
        const bike = bikes[0];
        relations.bikeModels.push({ bikeModelId: bike.bike_model_id, modelKey: bike.model_key });
        evidence.sources.push("02_bike_model");
        evidence.facts.push({ type: "BIKE_MODEL", value: bike, source: "02_bike_model" });
        const years = await readEvidence(`select bike_model_year_id,year_range_label,generation_name,front_tire_full_size,rear_tire_full_size,battery_standard_code,front_brake_spec,rear_brake_spec from public."03_bike_model_year" where bike_model_id=$1 and is_active=true order by start_year,bike_model_year_id;`, [bike.bike_model_id]);
        evidence.sources.push("03_bike_model_year");
        evidence.facts.push(...years.map((year) => ({ type: "MODEL_YEAR", value: year, source: "03_bike_model_year" })));
        if (years.length === 0) evidence.missing.push(`active model years: ${targetBikeModelKey}`);
      }
    } catch (error) {
      evidence.missing.push(error instanceof Error ? error.message : "bike evidence query failed");
    }
  }
  if (evidence.missing.length > 0) evidence.status = "BLOCKED";
  else if (evidence.sources.length > 0) evidence.status = "VERIFIED_DB";

  const imageDefaults = typeRules[contentType].images;
  const imagePlan = {
    thumbnail: { required: imageDefaults.thumbnail, type: "editorial context image", description: `${topic} 주제를 한눈에 식별할 수 있는 단순한 장면. 긴 설명문이나 수치 텍스트를 넣지 않는다.` },
    hero: { required: imageDefaults.hero, type: "context image", description: imageDefaults.hero ? `${topic}의 실제 맥락을 보여주는 이미지` : "v1에서는 필수 아님" },
    bodyImages: isPressureTemplate ? [{ type: "diagram", description: "타이어 밸브에 공기압 측정 도구를 연결하는 위치를 보여주는 단순 도식. 긴 문장 없음." }] : []
  };

  const blockIssues = validateBlocks(draft.blocks, rules.validBlockTypes);
  const serializedDraft = JSON.stringify({ title: draft.title, summary: draft.summary, bodyBlocks: draft.blocks });
  const claimIssues = rules.prohibitedClaims.filter((claim) => serializedDraft.includes(claim));
  const qaIssues = [...blockIssues, ...claimIssues.map((claim) => `Unsupported claim: ${claim}`)];
  if (draft.templateStatus === "GENERIC_REVIEW_REQUIRED") qaIssues.push("Generic copy template requires editorial review");
  const checks = {
    title: draft.title.length > 0,
    summary: draft.summary.length > 0,
    validContentType: rules.validContentTypes.includes(contentType),
    validBlocks: blockIssues.length === 0,
    evidenceComplete: ["VERIFIED_DB", "NOT_REQUIRED"].includes(evidence.status),
    noUnsupportedClaims: claimIssues.length === 0,
    validRelations: relations.parts.every((part) => rules.validPartTypes.includes(part.partType) && part.scopeType === "CATEGORY") && (targetBikeModelKey ? relations.bikeModels.length === 1 : true),
    validImagePlan: typeof imagePlan.thumbnail.required === "boolean" && typeof imagePlan.hero.required === "boolean" && Array.isArray(imagePlan.bodyImages),
    duplicateContentKey: false
  };
  let status = "READY_FOR_REVIEW";
  if (evidence.status === "BLOCKED") status = "BLOCKED_EVIDENCE";
  else {
    const failedCheck = Object.entries(checks).some(([name, value]) =>
      name === "duplicateContentKey" ? value !== false : value !== true
    );
    if (qaIssues.length > 0 || failedCheck) status = "REVIEW_REQUIRED";
  }
  const qa = { status, checks, issues: qaIssues };
  const contentPackage = {
    content: { contentKey, title: draft.title, summary: draft.summary, contentType, bodyBlocks: draft.blocks },
    relations,
    images: imagePlan,
    qa
  };

  const outputDirectory = path.join(projectDirectory, "content-work", contentKey);
  await mkdir(outputDirectory, { recursive: true });
  const outputs = {
    "plan.json": plan,
    "evidence.json": evidence,
    "body-blocks.json": draft.blocks,
    "relations.json": relations,
    "image-plan.json": imagePlan,
    "qa.json": qa,
    "content-package.json": contentPackage
  };
  await Promise.all(Object.entries(outputs).map(([fileName, value]) => writeFile(path.join(outputDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8")));
  console.log(JSON.stringify({ status, contentKey, outputDirectory, outputFiles: Object.keys(outputs).length, evidenceStatus: evidence.status }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
