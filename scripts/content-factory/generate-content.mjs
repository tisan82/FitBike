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
    summary: "내 오토바이의 권장 공기압을 찾고 앞뒤 타이어를 측정한 뒤, 기준과 비교하고 다시 확인하는 순서를 안내합니다.",
    blocks: [
      { type: "heading", level: 2, text: "확인 전에 준비할 것" },
      { type: "paragraph", text: "측정을 시작하기 전에 내 바이크에 적용되는 기준과 측정 도구를 함께 준비합니다. 앞타이어와 뒤타이어는 각각 확인할 수 있도록 구분합니다." },
      { type: "bullet_list", items: ["정확한 바이크 모델과 연식", "해당 차량의 공식 권장 공기압 기준", "타이어 밸브에 연결할 수 있는 공기압 게이지"] },
      { type: "heading", level: 2, text: "권장 공기압 기준 확인" },
      { type: "paragraph", text: "차량 매뉴얼이나 제조사의 공식 안내에서 현재 모델과 연식에 맞는 값을 찾습니다. 이 단계에서 확인한 앞뒤 기준값을 실제 측정값과 비교할 기준으로 사용합니다." },
      { type: "warning", title: "임의의 값을 기준으로 사용하지 마세요", body: "실제 적용값은 내 바이크 제조사의 공식 기준에서 확인해야 합니다." },
      { type: "heading", level: 2, text: "타이어 공기압 확인 순서" },
      { type: "step", number: 1, title: "앞뒤 타이어를 구분합니다", body: "준비한 기준에서 앞타이어와 뒤타이어 항목을 나누고, 먼저 측정할 타이어를 정합니다." },
      { type: "step", number: 2, title: "밸브를 확인합니다", body: "타이어에서 공기를 넣고 측정하는 밸브 위치를 찾고 게이지를 연결할 수 있도록 확인합니다." },
      { type: "step", number: 3, title: "게이지를 연결합니다", body: "게이지를 밸브에 맞게 연결하고 표시되는 측정값을 확인합니다." },
      { type: "step", number: 4, title: "권장 기준과 비교합니다", body: "현재 측정값을 해당 타이어의 공식 기준값과 비교해 조정이 필요한지 확인합니다." },
      { type: "step", number: 5, title: "필요한 경우 조정합니다", body: "기준과 차이가 있다면 준비한 기준에 맞도록 공기압을 조정합니다." },
      { type: "step", number: 6, title: "다시 측정합니다", body: "조정 후 게이지를 다시 연결해 측정값이 준비한 기준과 맞는지 확인합니다." },
      { type: "heading", level: 2, text: "앞뒤 타이어를 각각 확인" },
      { type: "paragraph", text: "한쪽 타이어의 확인을 마쳤더라도 다른 쪽을 같은 값으로 가정하지 않습니다. 준비 단계에서 구분한 앞뒤 기준에 따라 두 타이어를 각각 측정하고 비교합니다." },
      { type: "heading", level: 2, text: "확인 후 체크" },
      { type: "paragraph", text: "측정과 필요한 조정을 마치면 게이지를 분리하고 밸브 주변 상태를 눈으로 확인합니다. 마지막으로 앞뒤 타이어를 모두 확인했는지 점검합니다." }
    ],
    templateStatus: "QUALITY_TEMPLATE_V1_1"
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

function blockText(block) {
  return [block.text, block.title, block.body, ...(block.items ?? [])].filter(Boolean).join(" ");
}

function checkSemanticDuplication(blocks) {
  const sections = [];
  let currentSection = { texts: [], hasSteps: false };
  for (const block of blocks) {
    if (block.type === "heading") {
      if (currentSection.texts.length > 0) sections.push(currentSection);
      currentSection = { texts: [blockText(block)], hasSteps: false };
    } else {
      currentSection.texts.push(blockText(block));
      if (block.type === "step") currentSection.hasSteps = true;
    }
  }
  if (currentSection.texts.length > 0) sections.push(currentSection);
  const standaloneSectionTexts = sections.filter((section) => !section.hasSteps).map((section) => section.texts.join(" "));
  const concepts = [["모델", "연식", "제조사", "공식 기준"], ["밸브", "게이지", "연결"], ["측정값", "기준값", "비교"]];
  const repeatedThemes = concepts.filter((keywords) => standaloneSectionTexts.filter((section) => keywords.filter((word) => section.includes(word)).length >= 2).length > 2);
  return { pass: repeatedThemes.length === 0, repeatedThemeCount: repeatedThemes.length };
}

function checkProceduralCompleteness(blocks, contentType) {
  if (!["MAINTENANCE", "DIY"].includes(contentType)) return { pass: true, stages: [] };
  const text = blocks.map(blockText).join(" ");
  const stages = [
    { name: "PREPARE", present: /준비|기준.*확인/.test(text) },
    { name: "CHECK", present: /측정|점검|확인/.test(text) },
    { name: "EVALUATE", present: /비교|판단/.test(text) },
    { name: "FOLLOW_UP", present: /다시 측정|재측정|마지막.*확인|확인 후/.test(text) }
  ];
  return { pass: stages.every((stage) => stage.present), stages };
}

function evaluateInformationDensity(blocks) {
  const headings = blocks.filter((block) => block.type === "heading").length;
  const explanations = blocks.filter((block) => ["paragraph", "step", "tip", "warning"].includes(block.type)).length;
  const lists = blocks.filter((block) => ["bullet_list", "numbered_list"].includes(block.type)).length;
  const usefulUnits = explanations + lists;
  if (headings >= 3 && usefulUnits < headings + 2) return "TOO_LIGHT";
  if (blocks.length > 24 || usefulUnits > headings * 4) return "TOO_DENSE";
  return "GOOD";
}

function checkInformationPriority(blocks, proceduralComplete) {
  const tips = blocks.filter((block) => block.type === "tip").length;
  const proceduralSteps = blocks.filter((block) => block.type === "step").length;
  return proceduralComplete && (tips === 0 || proceduralSteps >= tips * 3);
}

function findUnsupportedClaims(blocks, prohibitedClaims, evidenceStatus) {
  const text = blocks.map(blockText).join(" ");
  const issues = prohibitedClaims.filter((claim) => text.includes(claim)).map((claim) => `Unsupported claim: ${claim}`);
  const evidencePatterns = [/\b\d+(?:\.\d+)?\s*(?:PSI|kPa|°C)\b/i, /(?:접지력|제동력|연비|수명|성능).{0,12}(?:향상|개선|증가|감소)/];
  if (evidenceStatus === "NOT_REQUIRED" && evidencePatterns.some((pattern) => pattern.test(text))) issues.push("Evidence-required claim in NOT_REQUIRED content");
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
  const isPressureTemplate = contentType === "MAINTENANCE" && targetPart === "TIRE" && topic.includes("타이어") && topic.includes("공기압");
  const contentKey = isPressureTemplate ? "motorcycle-tire-pressure-check" : createContentKey(topic, rules.slugTerms);
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
  const semanticDuplication = checkSemanticDuplication(draft.blocks);
  const proceduralCompleteness = checkProceduralCompleteness(draft.blocks, contentType);
  const informationDensity = evaluateInformationDensity(draft.blocks);
  const informationPriority = checkInformationPriority(draft.blocks, proceduralCompleteness.pass);
  const claimIssues = findUnsupportedClaims(draft.blocks, rules.prohibitedClaims, evidence.status);
  const qaIssues = [
    ...blockIssues,
    ...claimIssues,
    ...(semanticDuplication.pass ? [] : [`Semantic duplication detected (${semanticDuplication.repeatedThemeCount})`]),
    ...(proceduralCompleteness.pass ? [] : ["Procedural flow is incomplete"]),
    ...(informationDensity === "GOOD" ? [] : [`Information density is ${informationDensity}`]),
    ...(informationPriority ? [] : ["Supporting information outweighs the core procedure"])
  ];
  if (draft.templateStatus === "GENERIC_REVIEW_REQUIRED") qaIssues.push("Generic copy template requires editorial review");
  const checks = {
    title: draft.title.length > 0,
    summary: draft.summary.length > 0,
    validContentType: rules.validContentTypes.includes(contentType),
    validBlocks: blockIssues.length === 0,
    evidenceComplete: ["VERIFIED_DB", "NOT_REQUIRED"].includes(evidence.status),
    noUnsupportedClaims: claimIssues.length === 0,
    semanticDuplication: semanticDuplication.pass,
    proceduralCompleteness: proceduralCompleteness.pass,
    informationDensity,
    informationPriority,
    validRelations: relations.parts.every((part) => rules.validPartTypes.includes(part.partType) && part.scopeType === "CATEGORY") && (targetBikeModelKey ? relations.bikeModels.length === 1 : true),
    validImagePlan: typeof imagePlan.thumbnail.required === "boolean" && typeof imagePlan.hero.required === "boolean" && Array.isArray(imagePlan.bodyImages),
    duplicateContentKey: false
  };
  let status = "READY_FOR_REVIEW";
  if (evidence.status === "BLOCKED") status = "BLOCKED_EVIDENCE";
  else {
    const failedCheck = Object.entries(checks).some(([name, value]) => {
      if (name === "duplicateContentKey") return value !== false;
      if (name === "informationDensity") return value !== "GOOD";
      return value !== true;
    });
    if (qaIssues.length > 0 || failedCheck) status = "REVIEW_REQUIRED";
  }
  const qa = { status, checks, issues: qaIssues };
  const contentPackage = {
    content: { contentKey, title: draft.title, summary: draft.summary, contentType, bodyBlocks: draft.blocks },
    relations,
    images: imagePlan,
    qa
  };

  let outputDirectory = path.join(projectDirectory, "content-work", contentKey);
  if (existsSync(outputDirectory)) {
    let revision = 2;
    while (existsSync(path.join(projectDirectory, "content-work", `${contentKey}-v${revision}`))) revision += 1;
    outputDirectory = path.join(projectDirectory, "content-work", `${contentKey}-v${revision}`);
  }
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
