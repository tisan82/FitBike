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
  return slug || `content-${createHash("sha256").update(topic).digest("hex").slice(0, 12)}`;
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
  const titleText = title.normalize("NFKC").toLowerCase();
  const text = `${title} ${summary}`.normalize("NFKC").toLowerCase();
  const normalizedPart = targetPart
    ?? (includesAny(text, ["타이어", "tire"]) ? "TIRE" : null)
    ?? (includesAny(text, ["배터리", "battery"]) ? "BATTERY" : null)
    ?? (includesAny(text, ["브레이크", "brake"]) ? "BRAKE" : null);
  const titleSubject = normalizeSubject(titleText, normalizedPart);
  const subject = titleSubject === normalizedPart ? normalizeSubject(text, normalizedPart) : titleSubject;

  let action = "UNDERSTAND";
  if (includesAny(text, ["교체 후", "교환 후", "after replacement", "post-replacement"])) action = "POST_REPLACEMENT_CHECK";
  else if (includesAny(text, ["교체", "교환", "replace"])) action = "REPLACE";
  else if (includesAny(text, ["점검", "진단", "상태 확인", "inspect"])) action = "INSPECT";
  else if (includesAny(text, ["선택", "고르는", "choose", "select"])) action = "SELECT";
  else if (includesAny(text, ["관리", "유지", "maintenance"])) action = "MAINTAIN";
  else if (contentType === "MAINTENANCE" && includesAny(text, ["확인 방법", "확인하는 법", "how to check"])) action = "INSPECT";
  else if (includesAny(text, ["읽는 법", "읽기", "표기", "이해", "규격"])) action = "UNDERSTAND";

  const scope = targetBikeModelKey ? "MODEL" : "GENERIC";
  return {
    subject,
    action,
    contentType,
    targetPart: normalizedPart,
    targetBikeModelKey,
    scope,
    searchIntent: `${scope}:${subject}:${action}`
  };
}

function subjectRelationship(requestSubject, existingSubject, partType) {
  if (requestSubject === existingSubject) return "SAME";
  if (!partType) return "DISTINCT";
  const prefix = `${partType}_`;
  const requestSpecific = requestSubject.startsWith(prefix);
  const existingSpecific = existingSubject.startsWith(prefix);
  if ((requestSubject === partType && existingSpecific) || (existingSubject === partType && requestSpecific)) return "PARENT_CHILD";
  if (requestSpecific && existingSpecific) return "RELATED";
  return "DISTINCT";
}

function hasCoreSubjectCoverage(subject, existing) {
  const blocks = Array.isArray(existing.body_blocks) ? existing.body_blocks : [];
  const coveredBlocks = blocks.filter((block) => {
    const blockText = [block.title, block.text, block.body, ...(block.items ?? []), ...((block.rows ?? []).flat())].filter(Boolean).join(" ");
    return normalizeSubject(blockText.normalize("NFKC").toLowerCase(), existing.part_types?.[0] ?? null) === subject;
  });
  return coveredBlocks.length >= 2;
}

function classifyDuplicate(requestIntent, contentKey, title, existingContents) {
  const normalizedTitle = title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  let best = { status: "DISTINCT_CONTENT", duplicateWith: null, reason: "No existing content resolves the same normalized intent." };
  for (const existing of existingContents) {
    const existingIntent = normalizeIntent({
      title: existing.title,
      summary: existing.summary ?? "",
      contentType: existing.content_type,
      targetPart: existing.part_types?.[0] ?? null,
      targetBikeModelKey: existing.model_keys?.[0] ?? null
    });
    const exactKeyOrTitle = existing.content_key === contentKey || existing.title.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim() === normalizedTitle;
    const sameEntity = requestIntent.scope === existingIntent.scope
      && requestIntent.targetPart === existingIntent.targetPart
      && requestIntent.targetBikeModelKey === existingIntent.targetBikeModelKey;
    const sameIntent = requestIntent.subject === existingIntent.subject && requestIntent.action === existingIntent.action;
    if (exactKeyOrTitle || (sameEntity && sameIntent && requestIntent.contentType === existingIntent.contentType)) {
      return {
        status: "EXACT_DUPLICATE",
        duplicateWith: existing.content_key,
        reason: exactKeyOrTitle ? "The content key or normalized title already exists." : "Subject, action, scope, type, part, and bike resolve to the same intent."
      };
    }
    const relationship = subjectRelationship(requestIntent.subject, existingIntent.subject, requestIntent.targetPart);
    const coverageRequired = relationship === "PARENT_CHILD" || relationship === "RELATED";
    if (sameEntity && requestIntent.action === existingIntent.action && (relationship === "SAME" || coverageRequired && hasCoreSubjectCoverage(requestIntent.subject, existing))) {
      best = {
        status: "NEAR_DUPLICATE",
        duplicateWith: existing.content_key,
        reason: relationship === "SAME" ? "The normalized subject, action, and target match while the content type differs." : `The ${relationship.toLowerCase()} subject is substantially covered by the existing content.`
      };
    }
  }
  return best;
}

function preGenerationDecision(duplicateStatus) {
  return duplicateStatus === "EXACT_DUPLICATE" ? "STOP" : "CONTINUE";
}

function contentTokens(value) {
  return new Set(JSON.stringify(value).normalize("NFKC").toLowerCase().match(/[a-z0-9가-힣]{2,}/g) ?? []);
}

function tokenOverlap(left, right) {
  const smaller = Math.min(left.size, right.size);
  if (smaller === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / smaller;
}

function classifyPostGenerationDuplicate(requestIntent, draft, existingContents) {
  let best = { status: "CONTENT_DISTINCT", duplicateWith: null, reason: "Generated content does not substantially answer the same core question as published content." };
  const generatedTokens = contentTokens({ title: draft.title, summary: draft.summary, body_blocks: draft.blocks });
  for (const existing of existingContents) {
    const existingIntent = normalizeIntent({ title: existing.title, summary: existing.summary ?? "", contentType: existing.content_type, targetPart: existing.part_types?.[0] ?? null, targetBikeModelKey: existing.model_keys?.[0] ?? null });
    const sameEntity = requestIntent.scope === existingIntent.scope && requestIntent.targetPart === existingIntent.targetPart && requestIntent.targetBikeModelKey === existingIntent.targetBikeModelKey;
    if (!sameEntity) continue;
    const relationship = subjectRelationship(requestIntent.subject, existingIntent.subject, requestIntent.targetPart);
    if (relationship === "DISTINCT") continue;
    const overlap = tokenOverlap(generatedTokens, contentTokens({ title: existing.title, summary: existing.summary, body_blocks: existing.body_blocks }));
    if (requestIntent.action === existingIntent.action && overlap >= 0.65) {
      return { status: "CONTENT_DUPLICATE", duplicateWith: existing.content_key, reason: "Generated answer coverage substantially matches published content despite the declared subject difference." };
    }
    const coverage = relationship === "SAME" || hasCoreSubjectCoverage(requestIntent.subject, existing);
    if (!coverage) continue;
    if (overlap >= 0.25) best = { status: "CONTENT_OVERLAP_ACCEPTABLE", duplicateWith: existing.content_key, reason: "Published content touches the subject, but the generated content provides a distinct focused answer." };
  }
  return best;
}

function partLabel(targetPart) {
  return { TIRE: "타이어", BATTERY: "배터리", BRAKE: "브레이크" }[targetPart] ?? "부품";
}

const subjectProfiles = {
  TIRE_WEAR: {
    focus: "접지면과 트레드의 마모 상태",
    locate: ["앞·뒤 타이어의 접지면과 트레드", "각 타이어 둘레의 여러 위치"],
    observe: ["트레드가 한쪽이나 특정 구간에서 더 많이 닳아 보이는지", "표면에 편마모, 뜯김 또는 다른 눈에 띄는 손상이 있는지"],
    compare: "앞·뒤 타이어와 각 타이어의 여러 위치를 비교해 마모 분포가 고른지 확인합니다.",
    evaluate: "마모가 한쪽에 집중되거나 손상이 함께 보이면 정상이라고 단정하지 말고 확인한 위치와 형태를 구분합니다.",
    followUp: "이상 마모가 의심되면 임의로 마모 한계나 남은 수명을 추정하지 말고 제조사 안내 또는 전문 점검을 통해 교체 필요 여부를 판단합니다.",
    coverage: [/접지면|트레드/, /마모|편마모/, /앞·뒤|앞뒤|여러 위치|둘레/, /전문 점검|교체 필요|후속 점검/]
  },
  TIRE_PRESSURE: {
    focus: "앞·뒤 타이어의 공기압 상태",
    locate: ["앞·뒤 타이어의 공기 주입구", "공기압을 확인할 수 있는 측정 위치"],
    observe: ["측정 준비 상태와 주입구 주변에 눈에 띄는 손상이 없는지", "승인된 측정 도구로 확인한 값이 현재 모델의 공식 기준과 비교 가능한지"],
    compare: "앞·뒤 타이어를 구분하고 측정 결과를 해당 모델과 운행 조건의 제조사 기준과 각각 비교합니다.",
    evaluate: "근거가 없는 수치를 적용하지 말고 측정 조건이나 공식 기준을 확인할 수 없는 결과는 확정값으로 판단하지 않습니다.",
    followUp: "차이가 확인되거나 반복해서 상태가 달라지면 원인을 임의로 단정하지 말고 공식 안내에 따른 추가 점검을 진행합니다.",
    coverage: [/공기압/, /앞·뒤|앞뒤/, /측정/, /공식 기준|제조사 기준/, /추가 점검/]
  },
  TIRE_CRACK: {
    focus: "타이어 표면과 옆면의 균열 상태",
    locate: ["접지면과 트레드 홈 주변", "타이어 양쪽 옆면과 둘레의 여러 위치"],
    observe: ["표면이 갈라지거나 선 모양의 균열이 이어지는지", "균열 주변에 변형, 뜯김 또는 다른 손상이 함께 보이는지"],
    compare: "앞·뒤 타이어와 둘레의 여러 위치를 비교해 균열의 위치와 퍼진 범위를 구분합니다.",
    evaluate: "균열이 보이면 깊이나 안전성을 눈으로만 단정하지 말고 함께 나타난 변화를 기록합니다.",
    followUp: "균열이나 변형이 의심되면 운행 가능 여부를 임의로 판단하지 말고 제조사 안내 또는 전문 점검을 확인합니다.",
    coverage: [/접지면|옆면/, /균열|갈라짐/, /앞·뒤|앞뒤|여러 위치|둘레/, /전문 점검|제조사 안내/]
  },
  BATTERY_CONDITION: {
    focus: "배터리 케이스와 주변의 외관 상태",
    locate: ["배터리 케이스의 각 면", "단자 주변과 고정 부위"],
    observe: ["케이스에 변형, 손상 또는 오염이 있는지", "단자 주변에 부식이나 이탈처럼 눈에 띄는 변화가 있는지"],
    compare: "케이스 각 면과 연결·고정 부위를 순서대로 비교해 변화가 한 위치에 집중되는지 확인합니다.",
    evaluate: "외관이나 연결 상태에 이상이 보이면 성능이나 수명을 외관만으로 단정하지 않습니다.",
    followUp: "변형, 손상 또는 연결 이상이 의심되면 현재 상태를 유지하고 제조사 안내 또는 전문 점검을 확인합니다.",
    coverage: [/케이스|외관/, /단자|고정 부위/, /변형|손상|오염|부식/, /전문 점검|제조사 안내/]
  },
  BATTERY_TERMINAL: {
    focus: "배터리 단자와 연결부 상태",
    locate: ["양쪽 단자와 단자 표시", "케이블이 연결된 체결 부위"],
    observe: ["단자 방향과 연결 위치를 구분할 수 있는지", "부식, 오염, 이탈 또는 손상이 보이는지"],
    compare: "현재 단자 방향과 연결 상태를 제품 표기 및 제조사 안내와 비교합니다.",
    evaluate: "방향이나 연결 상태가 불명확하면 임의로 분리하거나 연결하지 않습니다.",
    followUp: "이상이나 불일치가 의심되면 작업을 진행하지 말고 공식 절차 또는 전문 점검을 확인합니다.",
    coverage: [/단자/, /방향|연결 위치/, /부식|오염|이탈|손상/, /공식 절차|전문 점검/]
  },
  BATTERY_DIMENSION: {
    focus: "배터리 장착 공간과 외형 조건",
    locate: ["배터리가 놓이는 장착 공간", "고정부와 케이블이 지나가는 주변 공간"],
    observe: ["현재 배터리와 공간 사이의 간섭이나 눌림이 보이는지", "고정 상태와 단자 주변 공간이 공식 안내와 비교 가능한지"],
    compare: "현재 제품의 외형 정보와 장착 공간 조건을 모델·연식별 공식 기준과 항목별로 비교합니다.",
    evaluate: "공간이 비슷해 보인다는 이유만으로 장착 가능 여부를 확정하지 않습니다.",
    followUp: "외형 조건이나 고정 방식이 불명확하면 제품 규격과 제조사 안내를 추가로 확인합니다.",
    coverage: [/장착 공간/, /간섭|눌림|주변 공간/, /외형|고정/, /제품 규격|제조사 안내/]
  },
  BRAKE_PAD_WEAR: {
    focus: "브레이크 패드 마찰재의 마모 상태",
    locate: ["확인 가능한 패드 마찰재 부분", "좌우 또는 안쪽·바깥쪽 패드 위치"],
    observe: ["마찰재가 위치별로 다르게 닳아 보이는지", "깨짐, 뜯김 또는 비정상적인 표면 변화가 있는지"],
    compare: "확인 가능한 좌우 패드와 각 위치를 비교해 남은 마찰재와 마모 분포의 차이를 구분합니다.",
    evaluate: "보이는 일부만으로 안전성이나 남은 수명을 단정하지 말고 확인이 어려운 위치를 구분합니다.",
    followUp: "마모 차이 또는 손상이 의심되면 제조사 점검 절차나 전문 점검을 통해 교체 필요 여부를 판단합니다.",
    coverage: [/마찰재/, /마모|닳아/, /좌우|안쪽·바깥쪽|각 위치/, /전문 점검|교체 필요/]
  }
};

function genericSubjectProfile(targetPart) {
  const part = partLabel(targetPart);
  return {
    focus: `${part}에서 확인 가능한 상태`,
    locate: [`${part}의 확인 가능한 표면`, "주변에서 안전하게 볼 수 있는 위치"],
    observe: ["눈에 띄는 변형이나 손상이 있는지", "위치별로 상태 차이가 보이는지"],
    compare: "확인 가능한 여러 위치를 비교하고 차이가 보이는 부분을 구분합니다.",
    evaluate: "확인한 상태만으로 수명이나 성능을 단정하지 않습니다.",
    followUp: "이상이 의심되거나 확인이 어려우면 제조사 안내 또는 전문 점검을 확인합니다.",
    coverage: [new RegExp(part), /여러 위치|위치별/, /변형|손상/, /전문 점검|제조사 안내/]
  };
}

function maintenanceDraft(topic, targetPart, intent) {
  const part = partLabel(targetPart);
  const profile = subjectProfiles[intent.subject] ?? genericSubjectProfile(targetPart);
  return {
    title: topic,
    summary: `${profile.focus}를 위치별로 관찰하고 비교해 후속 점검이 필요한지 판단하는 방법을 안내합니다.`,
    blocks: [
      { type: "heading", level: 2, text: "무엇을 확인하나요?" },
      { type: "paragraph", text: `${part} 점검에서는 ${profile.focus}를 확인합니다. 한 위치만 보지 않고 확인 가능한 범위를 나누어 관찰한 뒤 차이를 비교합니다.` },
      { type: "heading", level: 2, text: "점검 전 준비" },
      { type: "bullet_list", items: ["바이크가 움직이지 않도록 안전한 상태에서 확인", `${part}의 확인 가능한 범위를 먼저 파악`, "차량 매뉴얼 또는 제조사 공식 안내 준비"] },
      { type: "heading", level: 2, text: "확인할 위치 찾기" },
      { type: "bullet_list", items: profile.locate },
      { type: "heading", level: 2, text: "상태 확인 순서" },
      ...profile.observe.map((body, index) => ({ type: "step", number: index + 1, title: `${index + 1}차 관찰 항목을 확인합니다`, body })),
      { type: "heading", level: 2, text: "위치별 상태 비교" },
      { type: "paragraph", text: profile.compare },
      { type: "heading", level: 2, text: "점검 결과 판단" },
      { type: "paragraph", text: profile.evaluate },
      { type: "heading", level: 2, text: "확인 후 조치" },
      { type: "paragraph", text: profile.followUp },
      { type: "warning", title: "수치나 교체 시기를 추정하지 마세요", body: `측정 근거 없이 ${part}의 수명, 성능 또는 교체 시기를 단정하지 말고 실제 제품 표기와 제조사 기준을 확인하세요.` }
    ],
    subjectProfile: profile
  };
}

function diyDraft(topic, targetPart) {
  const part = partLabel(targetPart);
  return {
    title: topic,
    summary: `${part} 관련 작업을 시작하기 전 준비부터 작업 결과 확인까지 필요한 순서를 정리합니다.`,
    blocks: [
      { type: "heading", level: 2, text: "작업 전 확인" },
      { type: "paragraph", text: `작업 대상 ${part}와 바이크 모델·연식을 먼저 확인합니다. 작업 절차와 안전 조건을 공식 정비 안내에서 확인할 수 없다면 작업을 시작하지 않습니다.` },
      { type: "heading", level: 2, text: "도구와 부품 준비" },
      { type: "bullet_list", items: ["공식 절차에 명시된 도구", "검증된 적용 부품", "분리한 부품을 구분할 공간"] },
      { type: "heading", level: 2, text: "작업 순서" },
      { type: "step", number: 1, title: "작업 위치를 확인합니다", body: `${part}와 주변 연결부의 원래 상태를 확인합니다.` },
      { type: "step", number: 2, title: "공식 절차에 따라 작업합니다", body: "확인한 순서와 체결 조건을 벗어나지 않도록 한 단계씩 진행합니다." },
      { type: "step", number: 3, title: "연결 상태를 복원합니다", body: "분리하거나 이동한 연결부를 공식 절차에 따라 원래 위치에 정리합니다." },
      { type: "heading", level: 2, text: "결과 확인" },
      { type: "paragraph", text: "작업한 위치와 주변에 남은 부품이나 도구가 없는지 확인하고, 작업 전 상태와 비교해 연결 누락이 없는지 점검합니다." },
      { type: "heading", level: 2, text: "주의 사항" },
      { type: "warning", body: "필요한 규격, 체결 조건 또는 안전 절차가 Evidence에 없으면 임의로 추정해 작업하지 마세요." }
    ]
  };
}

const understandSubjectProfiles = {
  TIRE_SIZE: {
    label: "타이어 규격 표기",
    question: "타이어 규격 표기는 무엇을 뜻하나요?",
    definition: "타이어 규격 표기는 크기와 구조, 적용 조건을 구분해 적은 식별 정보입니다.",
    identify: ["타이어 옆면에서 전체 표기를 찾습니다.", "표기의 순서와 구분 기호를 유지한 채 각 항목을 나눕니다."],
    interpret: "폭·편평비·휠 지름처럼 서로 다른 의미의 항목을 같은 위치끼리 비교합니다.",
    practical: "전체 표기를 기록한 뒤 바이크 모델과 연식의 공식 규격과 비교합니다.",
    summary: "일부 숫자만 같다고 호환을 판단하지 말고 전체 규격과 공식 기준을 함께 확인합니다.",
    coverage: [/규격 표기|전체 표기/, /폭|편평비|휠 지름/, /공식 규격|공식 기준/],
    adjacent: [/FRONT|REAR|앞·뒤 장착/, /TL|TT|튜브리스/, /하중지수/, /속도등급/]
  },
  TIRE_POSITION: {
    label: "앞·뒤 타이어 장착 위치",
    question: "앞·뒤 타이어는 어떻게 구분하나요?",
    definition: "FRONT와 REAR는 타이어가 의도된 앞 또는 뒤 장착 위치를 나타내는 구분입니다.",
    identify: ["타이어 옆면에서 FRONT 또는 REAR 같은 장착 위치 표기를 확인합니다.", "현재 바이크의 앞·뒤 타이어 규격을 차량 제원에서 각각 확인합니다."],
    interpret: "외형이나 트레드가 비슷해 보여도 위치 표기와 차량 제원이 다르면 같은 위치용이라고 판단하지 않습니다.",
    practical: "제품의 옆면 표기와 바이크 모델·연식의 앞·뒤 규격을 함께 대조합니다.",
    summary: "앞·뒤 위치는 외형으로 추정하지 말고 타이어 표기와 차량의 공식 제원으로 확인합니다.",
    coverage: [/FRONT|REAR/, /앞|뒤|장착 위치/, /옆면.*표기|표기.*옆면/, /차량 제원|공식 제원/],
    adjacent: [/폭|편평비|휠 지름/, /하중지수/, /속도등급/, /TL|TT|튜브리스/]
  },
  TIRE_TUBE_TYPE: {
    label: "TL과 TT 타이어 형식",
    question: "TL과 TT는 무엇이 다른가요?",
    definition: "TL과 TT는 타이어가 공기를 유지하는 구조와 사용하는 구성 방식을 구분하는 표기입니다.",
    identify: ["타이어 옆면에서 TL 또는 TT 표기를 찾습니다.", "현재 휠과 타이어가 요구하는 튜브 사용 조건을 공식 안내에서 확인합니다."],
    interpret: "TL은 튜브리스 형식, TT는 튜브 사용을 전제로 한 형식을 뜻하므로 서로 같은 조건으로 취급하지 않습니다.",
    practical: "현재 장착 상태와 제품 표기, 휠의 사용 조건을 함께 비교합니다.",
    summary: "외형이 비슷해도 TL과 TT 표기 및 사용 조건을 확인한 뒤 적용 여부를 판단합니다.",
    coverage: [/TL/, /TT/, /튜브리스|튜브 사용/, /휠.*사용 조건|사용 조건/],
    adjacent: [/FRONT|REAR|앞·뒤 장착/, /폭|편평비|휠 지름/, /하중지수/, /속도등급/]
  },
  TIRE_LOAD_INDEX: {
    label: "타이어 하중지수",
    question: "타이어 하중지수는 어떻게 이해하나요?",
    definition: "하중지수는 타이어 표기에서 허용 하중 조건을 확인하기 위한 코드입니다.",
    identify: ["타이어 옆면의 규격 표기에서 하중지수 위치를 찾습니다.", "코드의 의미는 제조사 또는 공인 표에서 확인합니다."],
    interpret: "코드 숫자를 무게 값으로 그대로 읽지 않고 대응 표와 차량의 요구 조건을 함께 봅니다.",
    practical: "현재 제품의 하중지수를 바이크 모델·연식의 공식 요구 조건과 비교합니다.",
    summary: "하중지수는 임의로 환산하지 말고 공식 대응 정보와 차량 기준으로 해석합니다.",
    coverage: [/하중지수/, /코드/, /대응 표|공인 표/, /요구 조건|차량 기준/],
    adjacent: [/FRONT|REAR|앞·뒤 장착/, /TL|TT|튜브리스/, /속도등급/, /편평비|휠 지름/]
  },
  TIRE_SPEED_RATING: {
    label: "타이어 속도등급",
    question: "타이어 속도등급은 어떻게 이해하나요?",
    definition: "속도등급은 타이어 표기에서 사용 조건을 확인하기 위한 등급 코드입니다.",
    identify: ["타이어 옆면의 규격 표기에서 속도등급 위치를 찾습니다.", "등급의 의미는 제조사 또는 공인 표에서 확인합니다."],
    interpret: "등급 문자를 성능 순위로 단정하지 않고 대응 표와 차량의 요구 조건을 함께 봅니다.",
    practical: "현재 제품의 속도등급을 바이크 모델·연식의 공식 요구 조건과 비교합니다.",
    summary: "속도등급은 임의로 해석하지 말고 공식 대응 정보와 차량 기준으로 확인합니다.",
    coverage: [/속도등급/, /등급 코드|등급 문자/, /대응 표|공인 표/, /요구 조건|차량 기준/],
    adjacent: [/FRONT|REAR|앞·뒤 장착/, /TL|TT|튜브리스/, /하중지수/, /편평비|휠 지름/]
  }
};

function understandPartsGuideDraft(topic, profile) {
  return {
    title: topic,
    summary: `${profile.label}의 의미와 확인 위치, 해석 방법을 구분해 설명합니다.`,
    blocks: [
      { type: "heading", level: 2, text: profile.question },
      { type: "paragraph", text: profile.definition },
      { type: "heading", level: 2, text: "어디에서 확인하나요?" },
      { type: "bullet_list", items: profile.identify },
      { type: "heading", level: 2, text: "차이를 어떻게 해석하나요?" },
      { type: "paragraph", text: profile.interpret },
      { type: "heading", level: 2, text: "실제 확인에 적용하기" },
      { type: "paragraph", text: profile.practical },
      { type: "heading", level: 2, text: "확인 결과 정리" },
      { type: "paragraph", text: profile.summary }
    ],
    subjectProfile: profile
  };
}

function partsGuideDraft(topic, targetPart, intent) {
  const understandProfile = intent.action === "UNDERSTAND" ? understandSubjectProfiles[intent.subject] : null;
  if (understandProfile) return understandPartsGuideDraft(topic, understandProfile);
  const part = partLabel(targetPart);
  const subject = intent.subject === "TIRE_SIZE" ? "타이어 규격 표기" : `${part}의 규격과 표기`;
  return {
    title: topic,
    summary: `${subject}를 구성하는 요소를 구분하고 각 정보가 무엇을 나타내는지 이해하는 방법을 설명합니다.`,
    blocks: [
      { type: "heading", level: 2, text: `${subject}란 무엇인가요?` },
      { type: "paragraph", text: `${subject}는 부품을 식별하고 적용 조건을 확인하기 위한 정보입니다. 한 항목만 떼어 보지 말고 표기의 구성과 순서를 함께 확인해야 합니다.` },
      { type: "heading", level: 2, text: "표기를 읽는 순서" },
      { type: "paragraph", text: "표기의 앞부분부터 구분 기호를 따라 읽고, 각 항목이 크기·구조·적용 조건 중 무엇을 설명하는지 나눠 봅니다." },
      { type: "heading", level: 2, text: "핵심 요소" },
      { type: "bullet_list", items: ["크기나 용량을 나타내는 항목", "구조 또는 형식을 구분하는 항목", "적용 조건을 확인하는 보조 표기"] },
      { type: "paragraph", text: "각 요소는 서로 다른 질문에 답합니다. 따라서 일부 표기가 같더라도 전체 규격이 동일하다고 판단할 수는 없습니다." },
      { type: "heading", level: 2, text: "표기 비교 예시" },
      { type: "paragraph", text: "두 표기를 비교할 때는 같은 위치의 항목끼리 대응시키고, 달라진 항목이 크기·구조·적용 조건 중 어디에 속하는지 확인합니다. 구체적인 적용 가능 여부는 공식 규격 근거가 있어야 판단할 수 있습니다." },
      { type: "heading", level: 2, text: "실제 확인에 적용하기" },
      { type: "paragraph", text: `현재 장착된 ${part}의 전체 표기를 기록한 뒤 바이크 모델과 연식에 맞는 공식 기준과 비교합니다. 표기의 의미를 이해하는 것과 실제 장착 가능 여부를 확정하는 것은 구분해야 합니다.` },
      { type: "warning", body: "표기 일부만 같다는 이유로 호환된다고 판단하지 마세요." }
    ]
  };
}

function modelGuideDraft(topic, targetPart, intent, evidence) {
  const part = partLabel(targetPart);
  const bikeFact = evidence.facts.find((fact) => fact.type === "BIKE_MODEL")?.value;
  const yearFacts = evidence.facts.filter((fact) => fact.type === "MODEL_YEAR").map((fact) => fact.value);
  const modelName = bikeFact?.model_name_ko || bikeFact?.model_name_en || intent.targetBikeModelKey;
  const tireRows = targetPart === "TIRE"
    ? yearFacts.filter((year) => year.front_tire_full_size || year.rear_tire_full_size).map((year) => [year.year_range_label ?? year.generation_name ?? "연식 구간 확인 필요", year.front_tire_full_size ?? "확인 필요", year.rear_tire_full_size ?? "확인 필요"])
    : [];
  const verifiedDataBlock = tireRows.length > 0
    ? { type: "table", headers: ["연식/세대", "앞타이어", "뒤타이어"], rows: tireRows }
    : { type: "paragraph", text: `현재 Evidence에는 연식별 ${part} 규격이 충분하지 않습니다. 확인되지 않은 값을 임의로 추가하지 않습니다.` };
  const inspectionBlocks = intent.action === "INSPECT" ? [
    { type: "heading", level: 2, text: "점검에 활용하는 방법" },
    { type: "step", number: 1, title: "내 바이크의 연식 구간을 확인합니다", body: "모델명만으로 판단하지 않고 실제 연식과 세대를 확인합니다." },
    { type: "step", number: 2, title: `장착된 ${part} 정보를 확인합니다`, body: "현재 장착 부품의 표기를 앞뒤 또는 위치별로 구분해 확인합니다." },
    { type: "step", number: 3, title: "검증된 데이터와 비교합니다", body: "확인한 연식 구간의 Evidence와 현재 표기를 비교하고 일치 여부를 판단합니다." },
    { type: "step", number: 4, title: "차이가 있으면 다시 확인합니다", body: "표기가 다르거나 확인되지 않는 항목은 임의로 해석하지 않고 공식 안내를 추가로 확인합니다." }
  ] : [
    { type: "heading", level: 2, text: "데이터 활용 방법" },
    { type: "paragraph", text: "내 바이크의 정확한 연식 구간을 먼저 찾은 뒤 같은 행의 검증된 정보를 확인합니다." }
  ];
  return {
    title: topic,
    summary: `${modelName}의 연식 구간과 검증된 ${part} 데이터를 확인하고 실제 점검에 적용하는 방법을 안내합니다.`,
    blocks: [
      { type: "heading", level: 2, text: `${modelName} 모델 확인` },
      { type: "paragraph", text: `이 가이드는 FitBike DB에서 확인된 ${modelName} 모델을 대상으로 합니다. 같은 모델명이라도 실제 연식과 세대를 구분해 데이터를 확인해야 합니다.` },
      { type: "heading", level: 2, text: "연식과 세대 구분" },
      { type: "paragraph", text: `현재 Evidence에는 ${yearFacts.length}개의 활성 연식 구간이 있습니다. 내 바이크가 어느 구간에 속하는지 확인한 뒤 ${part} 정보를 비교합니다.` },
      { type: "heading", level: 2, text: `검증된 ${part} 데이터` },
      verifiedDataBlock,
      ...inspectionBlocks,
      { type: "heading", level: 2, text: "관련 확인 사항" },
      { type: "paragraph", text: "DB 정보와 현재 장착 상태가 다르거나 연식 구간을 특정할 수 없다면 적용 가능 여부를 단정하지 않습니다." },
      { type: "warning", body: "모델명만으로 규격이나 적용 가능 여부를 확정하지 말고 실제 연식과 제조사 공식 안내를 함께 확인하세요." }
    ]
  };
}

function selectStrategy(input) {
  if (input.contentType === "MAINTENANCE") return maintenanceDraft(input.topic, input.targetPart, input.intent);
  if (input.contentType === "DIY") return diyDraft(input.topic, input.targetPart);
  if (input.contentType === "PARTS_GUIDE") return partsGuideDraft(input.topic, input.targetPart, input.intent);
  return modelGuideDraft(input.topic, input.targetPart, input.intent, input.evidence);
}

function validateBlocks(blocks, validTypes) {
  const issues = [];
  if (!Array.isArray(blocks) || blocks.length === 0) return ["body_blocks must be a non-empty array"];
  blocks.forEach((block, index) => {
    if (!block || typeof block !== "object" || !validTypes.includes(block.type)) return issues.push(`block ${index} has an unsupported type`);
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
  return [block.text, block.title, block.body, ...(block.items ?? []), ...(block.headers ?? []), ...(block.rows ?? []).flat()].filter(Boolean).join(" ");
}

function sectionsFromBlocks(blocks) {
  const sections = [];
  let current = null;
  for (const block of blocks) {
    if (block.type === "heading") {
      if (current) sections.push(current);
      current = { heading: block.text, blocks: [] };
    } else if (current) current.blocks.push(block);
  }
  if (current) sections.push(current);
  return sections;
}

function checkSemanticDuplication(blocks) {
  const sections = sectionsFromBlocks(blocks);
  const normalized = sections.map((section) => new Set(blockText({ text: section.heading, items: section.blocks.map(blockText) }).replace(/[.,!?·]/g, " ").split(/\s+/).filter((word) => word.length >= 2)));
  let duplicates = 0;
  for (let left = 0; left < normalized.length; left += 1) {
    for (let right = left + 1; right < normalized.length; right += 1) {
      const shared = [...normalized[left]].filter((word) => normalized[right].has(word)).length;
      const smaller = Math.min(normalized[left].size, normalized[right].size);
      if (smaller >= 5 && shared / smaller >= 0.75) duplicates += 1;
    }
  }
  return { pass: duplicates === 0, duplicatePairs: duplicates };
}

function requiresProcedure(contentType, action) {
  return contentType === "DIY" || (contentType === "MAINTENANCE" && ["INSPECT", "REPLACE", "MAINTAIN"].includes(action)) || (contentType === "MODEL_GUIDE" && ["INSPECT", "REPLACE"].includes(action));
}

function checkProceduralCompleteness(blocks, required) {
  if (!required) return { pass: true, required, stages: [] };
  const text = blocks.map(blockText).join(" ");
  const stages = [
    { name: "PREPARE", present: /준비|시작.*전|안전한 상태|연식.*확인/.test(text) },
    { name: "LOCATE", present: /확인할 위치|확인 가능한 범위|접근할 수 있는 위치|장착 위치/.test(text) },
    { name: "OBSERVE", present: /관찰|살펴|상태 확인|측정|변화가 있는지|닳아 보이는지/.test(text) },
    { name: "COMPARE", present: /비교|차이/.test(text) },
    { name: "EVALUATE", present: /비교|판단/.test(text) },
    { name: "FOLLOW_UP", present: /다시 확인|추가.*확인|확인 후|후속|조치/.test(text) }
  ];
  return { pass: stages.every((stage) => stage.present), required, stages };
}

function checkSubjectCoverage(blocks, profile) {
  if (!profile) return { pass: true, dimensions: [] };
  const text = blocks.map(blockText).join(" ");
  const dimensions = profile.coverage.map((pattern) => ({ pattern: pattern.source, present: pattern.test(text) }));
  return { pass: dimensions.every((dimension) => dimension.present), dimensions };
}

function checkSubjectDrift(blocks, profile) {
  if (!profile?.adjacent) return { pass: true, adjacentMatches: [] };
  const text = blocks.map(blockText).join(" ");
  const adjacentMatches = profile.adjacent.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  return { pass: adjacentMatches.length <= 1, adjacentMatches };
}

function checkQuestionAnswerAlignment(draft, intent) {
  const titleSubject = normalizeSubject(draft.title.normalize("NFKC").toLowerCase(), intent.targetPart);
  const firstHeading = draft.blocks.find((block) => block.type === "heading")?.text ?? "";
  return titleSubject === intent.subject && /\?$|나요\?$|하나요\?$/.test(firstHeading);
}

function countSentenceFragments(blocks) {
  return blocks.filter((block) => ["paragraph", "step", "tip", "warning"].includes(block.type))
    .map((block) => block.text ?? block.body ?? "")
    .filter((text) => text && !/[.!?]$/.test(text.trim())).length;
}

function checkCrossPartContamination(blocks, targetPart) {
  const text = blocks.map(blockText).join(" ").toLowerCase();
  const forbidden = {
    TIRE: [/배터리/, /단자/, /전기.{0,8}커넥터/, /마찰재/, /브레이크 패드/],
    BATTERY: [/트레드/, /접지면/, /타이어.{0,8}마모/, /마찰재/, /브레이크 패드/],
    BRAKE: [/배터리/, /단자 방향/, /트레드/, /접지면/, /타이어.{0,8}마모/]
  }[targetPart] ?? [];
  const matches = forbidden.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
  return { pass: matches.length === 0, matches };
}

function evaluateInformationDensity(blocks) {
  const sections = sectionsFromBlocks(blocks);
  const informativeSections = sections.filter((section) => {
    const units = section.blocks.reduce((total, block) => {
      if (["paragraph", "step"].includes(block.type)) return total + (blockText(block).length >= 35 ? 1 : 0);
      if (["bullet_list", "numbered_list"].includes(block.type)) return total + (block.items.length >= 3 ? 1 : 0);
      if (block.type === "table") return total + (block.rows.length > 0 ? 1 : 0);
      return total;
    }, 0);
    return units > 0;
  }).length;
  if (sections.length < 4 || informativeSections / sections.length < 0.8) return "TOO_LIGHT";
  const textLength = blocks.map(blockText).join("").length;
  if (blocks.length > 28 || textLength > 5000) return "TOO_DENSE";
  return "GOOD";
}

function checkInformationPriority(blocks) {
  const core = blocks.filter((block) => ["paragraph", "step", "table"].includes(block.type)).length;
  const supporting = blocks.filter((block) => ["tip", "warning"].includes(block.type)).length;
  return core >= 4 && core >= supporting * 2;
}

function findUnsupportedClaims(blocks, prohibitedClaims, evidenceStatus) {
  const text = blocks.map(blockText).join(" ");
  const issues = prohibitedClaims.filter((claim) => text.includes(claim)).map((claim) => `Unsupported claim: ${claim}`);
  const evidencePatterns = [/\b\d+(?:\.\d+)?\s*(?:PSI|kPa|V|Ah|CCA|°C)\b/i, /(?:접지력|제동력|연비|수명|성능).{0,12}(?:향상|개선|증가|감소)/];
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
      const responseText = await response.text();
      if (!response.ok) throw new Error(`Supabase evidence query failed (${response.status})`);
      return responseText ? JSON.parse(responseText) : [];
    };
  }
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (operation) => {
    if (operation !== "CONTENT_INDEX") throw new Error("Full internal evidence requires SUPABASE_ACCESS_TOKEN");
    const { data, error } = await client.from("12_content").select("content_id,content_key,title,summary,content_type").eq("is_active", true);
    if (error) throw new Error("Supabase content index query failed");
    return data.map((content) => ({ ...content, part_types: [], model_keys: [] }));
  };
}

function nextOutputDirectory(contentKey) {
  let outputDirectory = path.join(projectDirectory, "content-work", contentKey);
  if (!existsSync(outputDirectory)) return outputDirectory;
  let revision = 2;
  while (existsSync(path.join(projectDirectory, "content-work", `${contentKey}-v${revision}`))) revision += 1;
  return path.join(projectDirectory, "content-work", `${contentKey}-v${revision}`);
}

async function writeDuplicateReport(contentKey, requestIntent, duplicate) {
  const outputDirectory = nextOutputDirectory(contentKey);
  await mkdir(outputDirectory, { recursive: true });
  const status = duplicate.status === "EXACT_DUPLICATE" ? "DUPLICATE_CONTENT" : "DUPLICATE_REVIEW_REQUIRED";
  const report = {
    status,
    normalizedIntent: requestIntent,
    duplicateStatus: duplicate.status,
    duplicateWith: duplicate.duplicateWith,
    duplicateReason: duplicate.reason
  };
  await writeFile(path.join(outputDirectory, "duplicate-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status, contentKey, outputDirectory, duplicateWith: duplicate.duplicateWith, duplicateReason: duplicate.reason }, null, 2));
}

async function main() {
  const [rules, typeRules, blockSchema] = await Promise.all([readJson("content-rules.json"), readJson("content-type-rules.json"), readJson("content-block-schema.json")]);
  if (blockSchema.title !== "FitBike Content Blocks") throw new Error("Content block schema is invalid");
  const args = parseArguments(process.argv.slice(2));
  const topic = args.topic;
  const contentType = args.type?.toUpperCase();
  const targetPart = args.part?.toUpperCase() ?? null;
  const targetBikeModelKey = args["bike-model-key"] ?? null;
  if (!topic || !contentType) throw new Error("--topic and --type are required");
  if (!rules.validContentTypes.includes(contentType)) throw new Error(`Unsupported content type: ${contentType}`);
  if (targetPart && !rules.validPartTypes.includes(targetPart)) throw new Error(`Unsupported part type: ${targetPart}`);
  if (contentType === "MODEL_GUIDE" && !targetBikeModelKey) throw new Error("MODEL_GUIDE requires --bike-model-key");

  await loadLocalEnvironment();
  const contentKey = createContentKey(topic, rules.slugTerms);
  const requestIntent = normalizeIntent({ title: topic, contentType, targetPart, targetBikeModelKey });
  const readEvidence = await createEvidenceReader();
  const indexQuery = process.env.SUPABASE_ACCESS_TOKEN ? `
    select c.content_id,c.content_key,c.title,c.summary,c.content_type,c.body_blocks,
      coalesce(array_agg(distinct p.part_type) filter (where p.part_type is not null), '{}') as part_types,
      coalesce(array_agg(distinct b.model_key) filter (where b.model_key is not null), '{}') as model_keys
    from public."12_content" c
    left join public."15_content_part_link" p on p.content_id=c.content_id
    left join public."13_content_bike_model" cb on cb.content_id=c.content_id
    left join public."02_bike_model" b on b.bike_model_id=cb.bike_model_id
    where c.is_active=true
    group by c.content_id,c.content_key,c.title,c.summary,c.content_type,c.body_blocks;` : "CONTENT_INDEX";
  const existingContents = await readEvidence(indexQuery);
  const duplicate = classifyDuplicate(requestIntent, contentKey, topic, existingContents);
  if (preGenerationDecision(duplicate.status) === "STOP") {
    await writeDuplicateReport(contentKey, requestIntent, duplicate);
    return;
  }

  const evidence = { status: "NOT_REQUIRED", sources: [], facts: [], missing: [] };
  const relations = { bikeModels: [], bikeModelYears: [], parts: targetPart ? [{ partType: targetPart, scopeType: "CATEGORY" }] : [] };
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

  const draft = selectStrategy({ topic, contentType, targetPart, intent: requestIntent, evidence });
  const postGenerationDuplicate = classifyPostGenerationDuplicate(requestIntent, draft, existingContents);
  const plan = {
    topic,
    contentKey,
    title: draft.title,
    summary: draft.summary,
    contentType,
    targetPart,
    targetBikeModelKey,
    normalizedIntent: requestIntent,
    strategy: contentType,
    intent: typeRules[contentType].intent,
    sections: draft.blocks.filter((block) => block.type === "heading").map((block) => block.text),
    requiredEvidence: targetBikeModelKey || contentType === "MODEL_GUIDE" ? ["02_bike_model", "03_bike_model_year"] : [],
    imageRequirements: ["Do not place long explanatory text inside images"],
    relationRequirements: [targetPart ? `${targetPart}:CATEGORY` : null, targetBikeModelKey ? `BIKE_MODEL:${targetBikeModelKey}` : null].filter(Boolean)
  };
  const imageDefaults = typeRules[contentType].images;
  const bodyImages = imageDefaults.bodyVisualPreferred ? [{ type: "diagram", description: `${partLabel(targetPart)}의 주요 표기 또는 확인 위치를 텍스트보다 빠르게 이해할 수 있는 단순 도식. 수치나 긴 문장 없음.` }] : [];
  const imagePlan = {
    thumbnail: { required: imageDefaults.thumbnail, type: "editorial context image", description: `${topic} 주제를 한눈에 식별할 수 있는 단순한 장면. 긴 설명문이나 수치 텍스트를 넣지 않는다.` },
    hero: { required: imageDefaults.hero, type: "context image", description: imageDefaults.hero ? `${topic}의 실제 맥락을 보여주는 이미지` : "필수 아님" },
    bodyImages
  };

  const blockIssues = validateBlocks(draft.blocks, rules.validBlockTypes);
  const semanticDuplication = checkSemanticDuplication(draft.blocks);
  const proceduralRequired = requiresProcedure(contentType, requestIntent.action);
  const proceduralCompleteness = checkProceduralCompleteness(draft.blocks, proceduralRequired);
  const subjectCoverage = checkSubjectCoverage(draft.blocks, draft.subjectProfile);
  const subjectDrift = checkSubjectDrift(draft.blocks, draft.subjectProfile);
  const questionAnswerAlignment = checkQuestionAnswerAlignment(draft, requestIntent);
  const crossPartContamination = checkCrossPartContamination(draft.blocks, targetPart);
  const informationDensity = evaluateInformationDensity(draft.blocks);
  const informationPriority = checkInformationPriority(draft.blocks) && subjectCoverage.pass;
  const claimIssues = findUnsupportedClaims(draft.blocks, rules.prohibitedClaims, evidence.status);
  const sentenceFragments = countSentenceFragments(draft.blocks);
  const relationValidity = relations.parts.every((part) => rules.validPartTypes.includes(part.partType) && part.scopeType === "CATEGORY") && (targetBikeModelKey ? relations.bikeModels.length === 1 : true);
  const imagePlanValidity = typeof imagePlan.thumbnail.required === "boolean" && typeof imagePlan.hero.required === "boolean" && Array.isArray(imagePlan.bodyImages);
  const evidenceComplete = ["VERIFIED_DB", "NOT_REQUIRED"].includes(evidence.status);
  const qaIssues = [
    ...(postGenerationDuplicate.status === "CONTENT_DUPLICATE" ? [`Post-generation duplicate detected: ${postGenerationDuplicate.duplicateWith}`] : []),
    ...blockIssues,
    ...claimIssues,
    ...(semanticDuplication.pass ? [] : [`Semantic duplication detected (${semanticDuplication.duplicatePairs})`]),
    ...(proceduralCompleteness.pass ? [] : ["Procedural flow is incomplete"]),
    ...(subjectCoverage.pass ? [] : ["Normalized subject is not sufficiently covered"]),
    ...(subjectDrift.pass ? [] : [`Adjacent subject drift detected (${subjectDrift.adjacentMatches.join(", ")})`]),
    ...(questionAnswerAlignment ? [] : ["Question and answer are not aligned with the normalized subject"]),
    ...(sentenceFragments === 0 ? [] : [`Sentence fragments detected (${sentenceFragments})`]),
    ...(crossPartContamination.pass ? [] : [`Cross-part contamination detected (${crossPartContamination.matches.join(", ")})`]),
    ...(informationDensity === "GOOD" ? [] : [`Information density is ${informationDensity}`]),
    ...(informationPriority ? [] : ["Supporting information outweighs the core procedure"]),
    ...(relationValidity ? [] : ["Relations are invalid"]),
    ...(imagePlanValidity ? [] : ["Image plan is invalid"])
  ];
  let status = "READY_FOR_REVIEW";
  if (!evidenceComplete) status = "BLOCKED_EVIDENCE";
  else if (qaIssues.length > 0) status = "REVIEW_REQUIRED";
  const checks = {
    title: draft.title.length > 0,
    summary: draft.summary.length > 0,
    validContentType: rules.validContentTypes.includes(contentType),
    validBlocks: blockIssues.length === 0,
    duplicateStatus: duplicate.status,
    duplicateWith: duplicate.duplicateWith,
    duplicateReason: duplicate.reason,
    postGenerationDuplicate,
    informationDensity,
    semanticDuplication: semanticDuplication.pass,
    proceduralCompleteness: proceduralCompleteness.pass,
    proceduralCompletenessRequired: proceduralRequired,
    proceduralStages: proceduralCompleteness.stages,
    subjectCoverage: subjectCoverage.pass,
    subjectCoverageDimensions: subjectCoverage.dimensions,
    subjectDrift: subjectDrift.pass,
    subjectDriftMatches: subjectDrift.adjacentMatches,
    questionAnswerAlignment,
    crossPartContamination: crossPartContamination.pass,
    crossPartContaminationMatches: crossPartContamination.matches,
    informationPriority,
    evidenceComplete,
    unsupportedClaims: claimIssues.length,
    sentenceFragments,
    relationValidity,
    imagePlanValidity
  };
  const qa = { status, checks, issues: qaIssues };
  const contentPackage = { content: { contentKey, title: draft.title, summary: draft.summary, contentType, bodyBlocks: draft.blocks }, relations, images: imagePlan, qa };
  const outputDirectory = nextOutputDirectory(contentKey);
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export { classifyDuplicate, classifyPostGenerationDuplicate, normalizeIntent, partsGuideDraft, preGenerationDecision, subjectRelationship, understandSubjectProfiles };
