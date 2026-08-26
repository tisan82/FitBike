import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveFitBikeEvidence } from "./verified-evidence.mjs";

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
async function loadEnvironment() {
  const file = path.join(projectDirectory, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && process.env[match[1].trim()] === undefined) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}
async function readEvidence(query, parameters = []) {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!origin || !token) throw new Error("PRODUCTION_EVIDENCE_CREDENTIAL_MISSING");
  const projectRef = new URL(origin).hostname.split(".")[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, parameters, read_only: true }) });
  if (!response.ok) throw new Error(`PRODUCTION_EVIDENCE_QUERY_${response.status}`);
  return response.json();
}
await loadEnvironment();
const cases = [
  { name: "Tire", modelKey: "YAMAHA_NMAX125", partType: "TIRE" },
  { name: "Battery", modelKey: "YAMAHA_NMAX125", partType: "BATTERY" },
  { name: "Brake", modelKey: "HONDA_PCX125", partType: "BRAKE" }
];
const results = [];
for (const item of cases) {
  const result = await resolveFitBikeEvidence({ readEvidence, modelKey: item.modelKey, partType: item.partType });
  results.push({ ...item, status: result.status, identity: result.identity, coverage: result.coverage, missing: result.missing, conflicts: result.conflicts });
}
console.log(JSON.stringify({ status: results.every((item) => ["VERIFIED", "UNVERIFIED"].includes(item.status)) ? "PASS" : "FAIL", mutation: "NONE", results }, null, 2));
