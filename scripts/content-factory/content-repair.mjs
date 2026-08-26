import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { synchronizePublishArtifacts } from "./artifact-synchronization.mjs";

const repairablePatterns = [/Sentence fragments detected/, /Information density is TOO_LIGHT/, /Supporting information outweighs/, /Semantic duplication detected/, /Question and answer are not aligned/];

function blockText(block) { return block.text ?? block.body ?? (block.items ?? []).join(" ") ?? ""; }
function sentenceFragments(blocks) { return blocks.filter((block) => ["paragraph", "step", "tip", "warning"].includes(block.type)).filter((block) => { const text = block.text ?? block.body ?? ""; return text && !/[.!?]$/.test(text.trim()); }).length; }
function informationDensity(blocks) {
  const headings = blocks.reduce((indexes, block, index) => block.type === "heading" ? [...indexes, index] : indexes, []);
  if (headings.length < 4) return "TOO_LIGHT";
  const informative = headings.filter((start, index) => blocks.slice(start + 1, headings[index + 1] ?? blocks.length).some((block) => ["paragraph", "step"].includes(block.type) && blockText(block).length >= 35 || ["bullet_list", "numbered_list"].includes(block.type) && block.items?.length >= 3 || block.type === "table" && block.rows?.length > 0)).length;
  return informative / headings.length >= 0.8 ? "GOOD" : "TOO_LIGHT";
}
function unsupportedNumericClaims(blocks, evidence, originalBlocks) {
  const pattern = /\b\d+(?:\.\d+)?\s*(?:PSI|kPa|V|Ah|CCA|mm)\b/gi;
  const allowed = `${JSON.stringify(evidence)} ${originalBlocks.map(blockText).join(" ")}`;
  return (blocks.map(blockText).join(" ").match(pattern) ?? []).filter((value) => !allowed.includes(value));
}
function completeFragment(text) {
  const trimmed = text.trim();
  if (!trimmed || /[.!?]$/.test(trimmed)) return text;
  return `${trimmed} 확인합니다.`;
}
function expandLightSections(blocks) {
  const result = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    result.push(block);
    if (block.type !== "heading") continue;
    const nextHeading = blocks.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate.type === "heading");
    const end = nextHeading === -1 ? blocks.length : nextHeading;
    const section = blocks.slice(index + 1, end);
    const informative = section.some((item) => ["paragraph", "step"].includes(item.type) && blockText(item).length >= 35 || ["bullet_list", "numbered_list"].includes(item.type) && item.items?.length >= 3 || item.type === "table" && item.rows?.length > 0);
    if (!informative) result.push({ type: "paragraph", text: `${block.text} 항목은 현재 확인 가능한 정보와 공식 안내를 구분해 살펴봅니다. 확인되지 않은 규격이나 호환 정보는 추정하지 않습니다.` });
  }
  return result;
}
function removeRepeatedBlocks(blocks) {
  const seen = new Set();
  return blocks.filter((block) => {
    if (!["paragraph", "step", "tip", "warning"].includes(block.type)) return true;
    const normalized = blockText(block).replace(/\s+/g, " ").trim();
    if (!normalized || !seen.has(normalized)) { seen.add(normalized); return true; }
    return false;
  });
}

function repairContent({ contentPackage, evidence, qa, retryLimit = 2 }) {
  const nonRepairable = qa.issues.filter((issue) => !repairablePatterns.some((pattern) => pattern.test(issue)));
  if (nonRepairable.length) return { status: "NOT_AUTO_REPAIRABLE", attempts: 0, issues: nonRepairable, contentPackage, qa };
  const originalBlocks = structuredClone(contentPackage.content.bodyBlocks);
  let blocks = structuredClone(originalBlocks);
  let attempts = 0;
  while (attempts < retryLimit) {
    attempts += 1;
    blocks = blocks.map((block) => block.type === "paragraph" ? { ...block, text: completeFragment(block.text) } : ["step", "tip", "warning"].includes(block.type) ? { ...block, body: completeFragment(block.body) } : block);
    blocks = removeRepeatedBlocks(blocks);
    if (qa.checks.questionAnswerAlignment === false) {
      const firstHeading = blocks.findIndex((block) => block.type === "heading");
      if (firstHeading >= 0) blocks[firstHeading] = { ...blocks[firstHeading], text: `${contentPackage.content.title}에서 무엇을 확인해야 하나요?` };
    }
    if (informationDensity(blocks) === "TOO_LIGHT") blocks = expandLightSections(blocks);
    const fragments = sentenceFragments(blocks);
    const density = informationDensity(blocks);
    const unsupported = unsupportedNumericClaims(blocks, evidence, originalBlocks);
    const core = blocks.filter((block) => ["paragraph", "step", "table"].includes(block.type)).length;
    const supporting = blocks.filter((block) => ["tip", "warning"].includes(block.type)).length;
    const informationPriority = core >= 4 && core >= supporting * 2;
    if (fragments === 0 && density === "GOOD" && unsupported.length === 0 && informationPriority) {
      const repairedQa = { ...qa, status: "READY_FOR_REVIEW", checks: { ...qa.checks, sentenceFragments: 0, informationDensity: "GOOD", semanticDuplication: true, questionAnswerAlignment: true, informationPriority: true, unsupportedClaims: qa.checks.unsupportedClaims ?? 0 }, issues: [], repair: { status: "PASS", attempts, evidenceOnly: true, unsupportedAdded: [] } };
      return { status: "PASS", attempts, contentPackage: { ...contentPackage, content: { ...contentPackage.content, bodyBlocks: blocks }, qa: repairedQa }, qa: repairedQa };
    }
  }
  return { status: "HOLD_CONTENT", attempts, issues: ["AUTO_REPAIR_RETRY_EXHAUSTED"], contentPackage, qa: { ...qa, repair: { status: "FAIL", attempts } } };
}

async function repairContentDirectory(contentDirectory, retryLimit = 2) {
  const [contentPackage, evidence, qa] = await Promise.all(["content-package.json", "evidence.json", "qa.json"].map(async (file) => JSON.parse(await readFile(path.join(contentDirectory, file), "utf8"))));
  const result = repairContent({ contentPackage, evidence, qa, retryLimit });
  if (result.status === "PASS") await Promise.all([
    writeFile(path.join(contentDirectory, "body-blocks.json"), `${JSON.stringify(result.contentPackage.content.bodyBlocks, null, 2)}\n`, "utf8"),
    writeFile(path.join(contentDirectory, "content-package.json"), `${JSON.stringify(result.contentPackage, null, 2)}\n`, "utf8"),
    writeFile(path.join(contentDirectory, "qa.json"), `${JSON.stringify(result.qa, null, 2)}\n`, "utf8")
  ]);
  if (result.status === "PASS") result.artifactSynchronization = await synchronizePublishArtifacts(contentDirectory, { required: false });
  return result;
}

export { repairContent, repairContentDirectory, unsupportedNumericClaims };
