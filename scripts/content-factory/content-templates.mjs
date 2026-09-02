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
  const text = JSON.stringify(blocks).normalize("NFKC");
  const realityPatterns = {
    ACCESS_SCOPE: /시트|커버|외장|수납|접근 범위|분리 범위/,
    VISIBLE_SCOPE: /직접 확인|눈으로 확인|확인 가능한 범위|보이는 범위/,
    MODEL_VARIANCE: /차종|모델|연식|세대|구조.*다|위치.*다/,
    WORKSPACE_CONSTRAINT: /작업 공간|공구.*들어|손이.*들어|배선|간섭|좁/,
    STOP_CONDITION: /작업.*중단|진행하지|전문 점검|정비소|확인할 수 없/,
    COMPLETION_CHECK: /완료 확인|작업 결과|복구|흔들리지|누락|시동|작동 확인/
  };
  for (const signal of rule.requiredRealitySignals ?? []) {
    if (!realityPatterns[signal]?.test(text)) failures.push(`TEMPLATE_REALITY_SIGNAL:${signal}`);
  }
  return failures;
}

export { templateNames };
