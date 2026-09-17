import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AGENTS = {
  fitbike_pm: {
    file: "fitbike_pm.toml",
    model: "gpt-5.6-terra",
    effort: "medium",
    roles: [".agents/01_pm_agent.md"],
  },
  fitbike_design: {
    file: "fitbike_design.toml",
    model: "gpt-5.6-terra",
    effort: "medium",
    roles: [".agents/02_design_agent.md"],
  },
  fitbike_dev: {
    file: "fitbike_dev.toml",
    model: "gpt-5.6-terra",
    effort: "medium",
    roles: [".agents/03_dev_agent.md"],
  },
  fitbike_fitment_db_qa: {
    file: "fitbike_fitment_db_qa.toml",
    model: "gpt-5.6-sol",
    effort: "high",
    roles: [".agents/04_qa_agent.md", ".agents/05_fitment_db_qa_agent.md"],
  },
  fitbike_ui_seo_qa: {
    file: "fitbike_ui_seo_qa.toml",
    model: "gpt-5.6-terra",
    effort: "medium",
    roles: [".agents/04_qa_agent.md", ".agents/06_ui_seo_qa_agent.md"],
  },
  fitbike_release_qa: {
    file: "fitbike_release_qa.toml",
    model: "gpt-5.6-sol",
    effort: "high",
    roles: [".agents/04_qa_agent.md", ".agents/07_release_qa_agent.md"],
  },
  fitbike_audit_reviewer: {
    file: "fitbike_audit_reviewer.toml",
    model: "gpt-6-astra",
    effort: "high",
    roles: [".agents/08_audit_reviewer.md"],
  },
};

const REQUIRED_FILES = [
  "AGENTS.md",
  ".agents/00_orchestrator.md",
  ".codex/config.toml",
  "docs/00_ai/README.md",
  "docs/tasks/README.md",
  ".github/workflows/agent-orchestration-qa.yml",
];

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  const quoted = value.match(/^"((?:[^"\\]|\\.)*)"$/);
  if (quoted) return JSON.parse(`"${quoted[1]}"`);
  throw new Error(`unsupported TOML value: ${value}`);
}

export function parseSimpleToml(source) {
  const result = {};
  let target = result;
  let multilineKey = null;
  let multiline = [];

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (multilineKey) {
      if (line === '"""') {
        target[multilineKey] = multiline.join("\n");
        multilineKey = null;
        multiline = [];
      } else {
        multiline.push(rawLine);
      }
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    const section = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (section) {
      target = result;
      for (const part of section[1].split(".")) {
        target[part] ??= {};
        target = target[part];
      }
      continue;
    }
    const multilineStart = line.match(/^([A-Za-z0-9_-]+)\s*=\s*"""$/);
    if (multilineStart) {
      multilineKey = multilineStart[1];
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!pair) throw new Error(`unsupported TOML syntax: ${rawLine}`);
    target[pair[1]] = parseScalar(pair[2]);
  }
  if (multilineKey) throw new Error(`unterminated TOML multiline: ${multilineKey}`);
  return result;
}

async function read(root, relative) {
  return readFile(path.join(root, relative), "utf8");
}

export async function validateRepository(root) {
  const errors = [];
  const texts = new Map();

  for (const file of REQUIRED_FILES) {
    try {
      texts.set(file, await read(root, file));
    } catch {
      errors.push(`MISSING_REQUIRED_FILE: ${file}`);
    }
  }

  let config;
  try {
    config = parseSimpleToml(await read(root, ".codex/config.toml"));
  } catch (error) {
    errors.push(`INVALID_CONFIG_TOML: ${error.message}`);
  }
  if (config) {
    const agents = config.agents ?? {};
    if (agents.enabled !== true) errors.push("AGENTS_NOT_ENABLED");
    if (agents.max_concurrent_threads_per_session !== 4) {
      errors.push("INVALID_MAX_CONCURRENT_THREADS: expected 4");
    }
    if (agents.default_subagent_model !== "gpt-5.6-terra") {
      errors.push("INVALID_DEFAULT_MODEL: expected gpt-5.6-terra");
    }
    if (agents.default_subagent_reasoning_effort !== "medium") {
      errors.push("INVALID_DEFAULT_EFFORT: expected medium");
    }
  }

  let discovered = [];
  try {
    discovered = (await readdir(path.join(root, ".codex/agents")))
      .filter((name) => name.endsWith(".toml"))
      .sort();
  } catch {
    errors.push("MISSING_AGENT_DIRECTORY: .codex/agents");
  }
  const expectedFiles = Object.values(AGENTS).map(({ file }) => file).sort();
  for (const file of expectedFiles.filter((file) => !discovered.includes(file))) {
    errors.push(`MISSING_CUSTOM_AGENT: ${file}`);
  }
  for (const file of discovered.filter((file) => !expectedFiles.includes(file))) {
    errors.push(`UNREGISTERED_CUSTOM_AGENT: ${file}`);
  }

  for (const [name, contract] of Object.entries(AGENTS)) {
    let agent;
    let source;
    try {
      source = await read(root, `.codex/agents/${contract.file}`);
      agent = parseSimpleToml(source);
    } catch (error) {
      errors.push(`INVALID_AGENT_TOML: ${contract.file}: ${error.message}`);
      continue;
    }
    if (agent.name !== name) errors.push(`AGENT_NAME_MISMATCH: ${contract.file}`);
    if (!agent.description?.trim()) errors.push(`AGENT_DESCRIPTION_MISSING: ${contract.file}`);
    if (!agent.developer_instructions?.trim()) errors.push(`AGENT_INSTRUCTIONS_MISSING: ${contract.file}`);
    if (agent.model !== contract.model) {
      errors.push(`AGENT_MODEL_MISMATCH: ${name}: expected ${contract.model}`);
    }
    if (agent.model_reasoning_effort !== contract.effort) {
      errors.push(`AGENT_EFFORT_MISMATCH: ${name}: expected ${contract.effort}`);
    }
    for (const role of contract.roles) {
      try {
        await read(root, role);
      } catch {
        errors.push(`MISSING_ROLE_PLAYBOOK: ${name}: ${role}`);
      }
      if (!agent.developer_instructions?.includes(role)) {
        errors.push(`ROLE_NOT_REFERENCED: ${name}: ${role}`);
      }
    }
  }

  const orchestrator = texts.get(".agents/00_orchestrator.md") ?? "";
  for (const name of Object.keys(AGENTS)) {
    if (!orchestrator.includes(name)) errors.push(`ORCHESTRATOR_AGENT_MISSING: ${name}`);
  }
  for (const marker of ["MODEL_FALLBACK", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-6-astra"] ) {
    if (!orchestrator.includes(marker)) errors.push(`MODEL_ROUTER_MARKER_MISSING: ${marker}`);
  }

  const packageJson = JSON.parse(await read(root, "package.json"));
  if (packageJson.scripts?.["agent:validate"] !== "node scripts/agent-orchestration/validate.mjs") {
    errors.push("PACKAGE_SCRIPT_MISSING: agent:validate");
  }
  if (packageJson.scripts?.["test:agent-orchestration"] !== "node --test scripts/agent-orchestration/validate.test.mjs") {
    errors.push("PACKAGE_SCRIPT_MISSING: test:agent-orchestration");
  }

  const workflow = texts.get(".github/workflows/agent-orchestration-qa.yml") ?? "";
  const selfTrigger = '".github/workflows/agent-orchestration-qa.yml"';
  if (workflow.split(selfTrigger).length - 1 < 2) {
    errors.push("CI_SELF_TRIGGER_MISSING: pull_request and push filters must include the workflow");
  }
  for (const command of ["npm run agent:validate", "npm run test:agent-orchestration"]) {
    if (!workflow.includes(command)) errors.push(`CI_COMMAND_MISSING: ${command}`);
  }

  const policyFiles = [
    "AGENTS.md",
    ...Object.values(AGENTS).flatMap(({ roles }) => roles),
    ".agents/00_orchestrator.md",
    "docs/00_ai/README.md",
    "docs/tasks/README.md",
  ];
  const banned = [
    /배포를 승인하시겠습니까/i,
    /Yes\s*\/\s*No/i,
    /wait for (?:the )?user approval/i,
    /대기 상태\s*\(Staging\)/i,
  ];
  for (const file of new Set(policyFiles)) {
    let source;
    try {
      source = await read(root, file);
    } catch {
      continue;
    }
    for (const pattern of banned) {
      if (pattern.test(source)) errors.push(`STAGE_APPROVAL_REINTRODUCED: ${file}: ${pattern}`);
    }
  }

  return errors;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const errors = await validateRepository(root);
  if (errors.length) {
    console.error(`Agent orchestration validation failed (${errors.length})`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Agent orchestration validation passed (${Object.keys(AGENTS).length} custom agents)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
