import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runContentQualityGate } from "./content-quality-gate.mjs";

const factoryDirectory = path.dirname(fileURLToPath(import.meta.url));

function parseContentDirectory(argv) {
  const index = argv.indexOf("--content-dir");
  if (index < 0 || !argv[index + 1]) throw new Error("--content-dir is required");
  return path.resolve(argv[index + 1]);
}

async function main() {
  const argv = process.argv.slice(2);
  const contentDirectory = parseContentDirectory(argv);
  const qualityGate = await runContentQualityGate(contentDirectory);

  if (qualityGate.status !== "PASS") {
    console.log(JSON.stringify({
      status: "HOLD_CONTENT",
      reason: "CONTENT_QUALITY_GATE_FAILED",
      qualityGate
    }, null, 2));
    process.exitCode = 2;
    return;
  }

  const core = spawnSync(process.execPath, [path.join(factoryDirectory, "publish-content-core.mjs"), ...argv], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (core.stdout) process.stdout.write(core.stdout);
  if (core.stderr) process.stderr.write(core.stderr);
  if (core.error) throw core.error;
  process.exitCode = core.status ?? 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
