const templateNames = ["CHECK", "HOW_TO", "TROUBLESHOOT", "SPEC", "MODEL_DATA", "EXPLAIN", "COMPARE", "PREVENT", "CHECKLIST"];

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function selectContentTemplate({ topic, contentType, explicitTemplate = null }) {
  if (explicitTemplate) {
    const normalized = explicitTemplate.toUpperCase();
    if (!templateNames.includes(normalized)) throw new Error(`Unsupported content template: ${explicitTemplate}`);
    return normalized;
  }
  const text = topic.normalize("NFKC").toLowerCase();
  if (contentType === "MODEL_GUIDE") return "MODEL_DATA";
  if (hasAny(text, ["vs", "차이", "비교"])) return "COMPARE";
  if (hasAny(text, ["시동이 안", "문제", "이상", "계속 방전", "원인"])) return "TROUBLESHOOT";
  if (hasAny(text, ["체크리스트", "출발 전", "인수 후", "다시 탈 때"])) return "CHECKLIST";
  if (hasAny(text, ["겨울철", "장기간", "예방", "관리법"])) return "PREVENT";
  if (contentType === "DIY" || hasAny(text, ["교체하는 방법", "교환 방법", "청소 방법", "보충 방법"])) return "HOW_TO";
  if (hasAny(text, ["규격", "표기", "등급", "점도", "읽는 법", "맞는 배터리"])) return "SPEC";
  if (hasAny(text, ["언제", "교체 시기", "점검", "마모", "상태 확인"])) return "CHECK";
  return "EXPLAIN";
}

export function validateTemplateContent({ template, blocks, rule }) {
  const failures = [];
  if (!templateNames.includes(template) || !rule) return ["CONTENT_TEMPLATE_INVALID"];
  if (blocks.length < rule.minBlocks) failures.push(`TEMPLATE_MIN_BLOCKS:${blocks.length}/${rule.minBlocks}`);
  if (blocks.length > rule.maxBlocks) failures.push(`TEMPLATE_MAX_BLOCKS:${blocks.length}/${rule.maxBlocks}`);
  for (const type of rule.requiredBlockTypes) {
    if (!blocks.some((block) => block.type === type)) failures.push(`TEMPLATE_REQUIRED_BLOCK:${type}`);
  }
  return failures;
}

export { templateNames };
