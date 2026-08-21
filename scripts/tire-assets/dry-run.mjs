import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const sourceDirectory = path.join(
  root,
  "assets-source/tire-models/maxxis/original",
);
const mapFile = path.join(import.meta.dirname, "tire-image-map.csv");
const supportedExtensions = new Set([".png", ".jpg", ".jpeg"]);
const databaseBrandName = "맥시스";

function loadLocalEnvironment() {
  const envFile = path.join(root, ".env.local");
  if (!fs.existsSync(envFile)) return;

  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function relativePath(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function extractModelName(fileName) {
  const stem = path.basename(fileName, path.extname(fileName));
  const match = stem.match(/^M\d+_(.+)$/iu);
  return match?.[1] ?? null;
}

async function fetchMaxxisModels() {
  loadLocalEnvironment();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.",
    );
  }

  const query = new URL("/rest/v1/11_tire_model", supabaseUrl);
  query.searchParams.set(
    "select",
    "tire_model_id,tire_model_key,brand_name,model_name,main_image_url,sub_image_url_1,sub_image_url_2",
  );
  query.searchParams.set("order", "model_name.asc");

  const response = await fetch(query, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });
  if (!response.ok) {
    throw new Error(`Supabase query failed (${response.status}): ${await response.text()}`);
  }
  const models = await response.json();
  const maxxisModels = models.filter((model) => model.brand_name === databaseBrandName);
  if (maxxisModels.length === 0) {
    const brands = [...new Set(models.map((model) => model.brand_name))].sort();
    console.warn(
      `No active ${databaseBrandName} rows were visible. Visible rows: ${models.length}; brands: ${brands.join(", ") || "(none)"}`,
    );
  }
  return maxxisModels;
}

function makeRows(files, models) {
  return files.map((sourceFile) => {
    const modelName = extractModelName(sourceFile);
    const matches = modelName
      ? models.filter(
          (model) => model.model_name.toLocaleLowerCase("en-US") === modelName.toLocaleLowerCase("en-US"),
        )
      : [];
    const model = matches.length === 1 ? matches[0] : null;
    let matchStatus = "MATCHED";
    if (matches.length === 0) matchStatus = "UNMATCHED";
    else if (matches.length > 1) matchStatus = "DUPLICATE";
    else if (!model.tire_model_key) matchStatus = "MISSING_TIRE_MODEL_KEY";

    const key = model?.tire_model_key ?? "";
    return {
      source_file: sourceFile,
      brand_name: model?.brand_name ?? databaseBrandName,
      model_name: modelName ?? "",
      tire_model_key: key,
      target_local_file: key
        ? `assets-source/tire-models/maxxis/upload/${key}/main.webp`
        : "",
      target_storage_path: key ? `tire-models/maxxis/${key}/main.webp` : "",
      match_status: matchStatus,
      current_main_image_url: model?.main_image_url ?? "",
    };
  });
}

const files = fs
  .readdirSync(sourceDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b, "en"));
const models = await fetchMaxxisModels();
const rows = makeRows(files, models);
const headers = [
  "source_file",
  "brand_name",
  "model_name",
  "tire_model_key",
  "target_local_file",
  "target_storage_path",
  "match_status",
];
const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
].join("\n");
fs.mkdirSync(path.dirname(mapFile), { recursive: true });
fs.writeFileSync(mapFile, `${csv}\n`, "utf8");

const count = (status) => rows.filter((row) => row.match_status === status).length;
console.log(`Source images: ${rows.length}`);
console.log(`Matched models: ${count("MATCHED")}`);
console.log(`Unmatched models: ${count("UNMATCHED")}`);
console.log(`Duplicate matches: ${count("DUPLICATE")}`);
console.log(`Missing tire_model_key: ${count("MISSING_TIRE_MODEL_KEY")}`);
console.log(`Generated target paths: ${rows.filter((row) => row.target_local_file).length}`);
console.log(`Storage upload targets: ${rows.filter((row) => row.target_storage_path).length}`);
console.log(`DB update targets: ${count("MATCHED")}`);
console.log(`Mapping CSV: ${relativePath(mapFile)}`);
const matchedModelIds = new Set(
  rows
    .filter((row) => row.match_status === "MATCHED")
    .map((row) => row.model_name.toLocaleLowerCase("en-US")),
);
const modelsWithoutSource = models.filter(
  (model) => !matchedModelIds.has(model.model_name.toLocaleLowerCase("en-US")),
);
console.log(`Active DB models without a source image: ${modelsWithoutSource.length}`);
for (const model of modelsWithoutSource) {
  console.log(`  ${model.model_name} (${model.tire_model_key})`);
}
console.log("\nFile mappings:");
for (const row of rows) {
  console.log(
    `${row.source_file} -> ${row.model_name || "(invalid filename)"} -> ${row.tire_model_key || "-"} -> ${row.target_storage_path || "-"} [${row.match_status}]`,
  );
  if (row.current_main_image_url) {
    console.log(`  current main_image_url: ${row.current_main_image_url}`);
  }
}

if (
  count("UNMATCHED") > 0 ||
  count("DUPLICATE") > 0 ||
  count("MISSING_TIRE_MODEL_KEY") > 0
) {
  process.exitCode = 2;
}
