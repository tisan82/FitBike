import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateRepository } from "./validate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fitbike-agent-validation-"));
  for (const relative of ["AGENTS.md", "package.json", ".agents", ".codex", ".github", "docs/00_ai", "docs/tasks"]) {
    await cp(path.join(repoRoot, relative), path.join(root, relative), { recursive: true });
  }
  return root;
}

test("current orchestration contract passes", async () => {
  assert.deepEqual(await validateRepository(repoRoot), []);
});

test("missing role playbook fails", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await unlink(path.join(root, ".agents/05_fitment_db_qa_agent.md"));
  const errors = await validateRepository(root);
  assert(errors.some((error) => error.includes("MISSING_ROLE_PLAYBOOK")));
});

test("missing stable agent model fails", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, ".codex/agents/fitbike_dev.toml");
  const source = await readFile(target, "utf8");
  await writeFile(target, source.replace('model = "gpt-5.6-terra"\n', ""));
  const errors = await validateRepository(root);
  assert(errors.some((error) => error.includes("AGENT_MODEL_MISMATCH: fitbike_dev")));
});

test("stage approval gate reintroduction fails", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, ".agents/00_orchestrator.md");
  const source = await readFile(target, "utf8");
  await writeFile(target, `${source}\n배포를 승인하시겠습니까? (Yes/No)\n`);
  const errors = await validateRepository(root);
  assert(errors.some((error) => error.includes("STAGE_APPROVAL_REINTRODUCED")));
});

test("unregistered custom agent fails", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, ".codex/agents/unknown.toml"), 'name = "unknown"\n');
  const errors = await validateRepository(root);
  assert(errors.some((error) => error.includes("UNREGISTERED_CUSTOM_AGENT")));
});

test("CI workflow must trigger on its own changes", async (t) => {
  const root = await fixture();
  t.after(() => rm(root, { recursive: true, force: true }));
  const target = path.join(root, ".github/workflows/agent-orchestration-qa.yml");
  const source = await readFile(target, "utf8");
  await writeFile(target, source.replaceAll('      - ".github/workflows/agent-orchestration-qa.yml"\n', ""));
  const errors = await validateRepository(root);
  assert(errors.some((error) => error.includes("CI_SELF_TRIGGER_MISSING")));
});
