import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const mapFile = path.join(import.meta.dirname, "tire-image-map.csv");
const resultFile = path.join(import.meta.dirname, "tire-image-upload-result.csv");
const sourceDirectory = path.join(root, "assets-source/tire-models/maxxis/original");
const bucket = "tire-assets";
const createBucket = process.argv.includes("--create-bucket");
const reuseWebp = process.argv.includes("--reuse-webp");
const resultHeaders = [
  "tire_model_key",
  "model_name",
  "source_file",
  "target_local_file",
  "target_storage_path",
  "convert_status",
  "upload_status",
  "storage_verify_status",
  "storage_url",
  "db_update_status",
  "db_verify_status",
  "final_status",
  "error_message",
];

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

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/u);
  const headers = lines.shift().split(",");
  return lines.map((line) =>
    Object.fromEntries(headers.map((header, index) => [header, line.split(",")[index] ?? ""])),
  );
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function saveResults(results) {
  const csv = [
    resultHeaders.join(","),
    ...results.map((result) =>
      resultHeaders.map((header) => csvCell(result[header])).join(","),
    ),
  ].join("\n");
  fs.writeFileSync(resultFile, `${csv}\n`, "utf8");
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replaceAll(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "__never__", "[REDACTED]")
    .replaceAll(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "__never__", "[REDACTED]")
    .replaceAll(process.env.SUPABASE_SECRET_KEY ?? "__never__", "[REDACTED]");
}

async function getPrivilegedKey(supabaseUrl) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SECRET_KEY, or SUPABASE_ACCESS_TOKEN is required.",
    );
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Supabase API key lookup failed (${response.status}).`);
  }
  const keys = await response.json();
  const privileged = keys.find((key) => key.name === "service_role") ??
    keys.find((key) => key.type === "secret");
  if (!privileged?.api_key) {
    throw new Error("No revealed service-role or secret Supabase API key was available.");
  }
  return privileged.api_key;
}

async function databaseQuery(projectRef, query, parameters = [], readOnly = true) {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required for database operations.");
  }
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, parameters, read_only: readOnly }),
    },
  );
  if (!response.ok) {
    throw new Error(`Supabase database query failed (${response.status}).`);
  }
  const payload = await response.json();
  return Array.isArray(payload) ? payload : (payload.result ?? []);
}

function newResult(row) {
  return {
    tire_model_key: row.tire_model_key,
    model_name: row.model_name,
    source_file: row.source_file,
    target_local_file: row.target_local_file,
    target_storage_path: row.target_storage_path,
    convert_status: "NOT_RUN",
    upload_status: "NOT_RUN",
    storage_verify_status: "NOT_RUN",
    storage_url: "",
    db_update_status: "NOT_RUN",
    db_verify_status: "NOT_RUN",
    final_status: "PENDING",
    error_message: "",
  };
}

async function objectExists(supabase, storagePath) {
  const directory = path.posix.dirname(storagePath);
  const fileName = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(bucket).list(directory, {
    limit: 10,
    search: fileName,
  });
  if (error) throw error;
  return data.some((object) => object.name === fileName);
}

async function verifyObject(supabase, storagePath, expectedSize) {
  const directory = path.posix.dirname(storagePath);
  const fileName = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(bucket).list(directory, {
    limit: 10,
    search: fileName,
  });
  if (error) throw error;
  const object = data.find((candidate) => candidate.name === fileName);
  const storedSize = Number(object?.metadata?.size ?? 0);
  const mimeType = object?.metadata?.mimetype ?? object?.metadata?.contentType;
  if (!object || storedSize <= 0 || storedSize !== expectedSize || mimeType !== "image/webp") {
    throw new Error(
      `Storage metadata mismatch (exists=${Boolean(object)}, size=${storedSize}, type=${mimeType ?? "unknown"}).`,
    );
  }

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  const response = await fetch(publicData.publicUrl, { method: "HEAD" });
  if (!response.ok) throw new Error(`Public object HEAD failed (${response.status}).`);
  if (response.headers.get("content-type")?.split(";")[0] !== "image/webp") {
    throw new Error(`Public object content type is ${response.headers.get("content-type") ?? "unknown"}.`);
  }
  return publicData.publicUrl;
}

loadLocalEnvironment();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");

const mapRows = parseCsv(fs.readFileSync(mapFile, "utf8"));
const matchedRows = mapRows.filter((row) => row.match_status === "MATCHED");
const unmatchedRows = mapRows.filter((row) => row.match_status === "UNMATCHED");
if (
  matchedRows.length !== 20 ||
  unmatchedRows.length !== 1 ||
  unmatchedRows[0].source_file !== "M073_tube.png" ||
  mapRows.some((row) => ["DUPLICATE", "MISSING_TIRE_MODEL_KEY"].includes(row.match_status))
) {
  throw new Error("Approved mapping invariant failed; no mutation was started.");
}

const privilegedKey = await getPrivilegedKey(supabaseUrl);
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const supabase = createClient(supabaseUrl, privilegedKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: initialBuckets, error: initialBucketError } = await supabase.storage.listBuckets();
if (initialBucketError) throw initialBucketError;
let tireBucket = initialBuckets.find((candidate) => candidate.id === bucket);
if (!tireBucket && createBucket) {
  const { error: createBucketError } = await supabase.storage.createBucket(bucket, {
    public: true,
    allowedMimeTypes: ["image/webp"],
  });
  if (createBucketError) throw createBucketError;
  const { data: verifiedBuckets, error: verifyBucketError } = await supabase.storage.listBuckets();
  if (verifyBucketError) throw verifyBucketError;
  tireBucket = verifiedBuckets.find((candidate) => candidate.id === bucket);
}
if (!tireBucket) throw new Error("tire-assets bucket does not exist.");
if (!tireBucket.public) throw new Error("tire-assets bucket exists but is not public.");
console.log(`Bucket verified: ${tireBucket.id} (public=${tireBucket.public})`);

const results = matchedRows.map(newResult);
results.push({
  ...newResult(unmatchedRows[0]),
  convert_status: "SKIPPED",
  upload_status: "SKIPPED",
  storage_verify_status: "SKIPPED",
  db_update_status: "SKIPPED",
  db_verify_status: "SKIPPED",
  final_status: "SKIPPED_NOT_TIRE_MODEL",
});
saveResults(results);

const keys = matchedRows.map((row) => row.tire_model_key);
const visibleDbModels = await databaseQuery(
  projectRef,
  `select tire_model_key, model_name, main_image_url
   from public."11_tire_model"
   where brand_name = '맥시스'
   order by tire_model_key`,
);
const approvedKeys = new Set(keys);
const dbModels = visibleDbModels.filter((model) => approvedKeys.has(model.tire_model_key));
if (dbModels.length !== 20) throw new Error(`Expected 20 DB models; found ${dbModels.length}.`);
const dbByKey = new Map(dbModels.map((model) => [model.tire_model_key, model]));
if (keys.some((key) => !dbByKey.has(key))) {
  throw new Error("One or more approved tire_model_key values were not found in the DB result.");
}

for (const result of results.filter((item) => item.final_status === "PENDING")) {
  try {
    const model = dbByKey.get(result.tire_model_key);
    if (!model || model.model_name !== result.model_name) {
      throw new Error("DB model identity differs from the approved mapping.");
    }
    if (model.main_image_url?.trim()) {
      result.convert_status = "SKIPPED";
      result.upload_status = "SKIPPED";
      result.storage_verify_status = "SKIPPED";
      result.db_update_status = "SKIPPED";
      result.db_verify_status = "SKIPPED";
      result.final_status = "SKIPPED_EXISTING_URL";
      continue;
    }
    if (await objectExists(supabase, result.target_storage_path)) {
      result.convert_status = "SKIPPED";
      result.upload_status = "SKIPPED";
      result.storage_verify_status = "SKIPPED";
      result.db_update_status = "SKIPPED";
      result.db_verify_status = "SKIPPED";
      result.final_status = "SKIPPED_EXISTING_OBJECT";
      continue;
    }

    const sourcePath = path.join(sourceDirectory, result.source_file);
    const targetPath = path.join(root, ...result.target_local_file.split("/"));
    const sourceMetadata = await sharp(sourcePath).metadata();
    if (!reuseWebp) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      await sharp(sourcePath)
        .webp({ quality: 85, alphaQuality: 100, effort: 6 })
        .toFile(targetPath);
    } else if (!fs.existsSync(targetPath)) {
      throw new Error("Approved converted WebP file is missing.");
    }
    const targetMetadata = await sharp(targetPath).metadata();
    const targetSize = fs.statSync(targetPath).size;
    if (
      targetMetadata.format !== "webp" ||
      targetSize <= 0 ||
      sourceMetadata.width !== targetMetadata.width ||
      sourceMetadata.height !== targetMetadata.height
    ) {
      throw new Error("Converted WebP format or dimensions failed verification.");
    }
    result.convert_status = "CONVERT_SUCCESS";

    const webp = fs.readFileSync(targetPath);
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(result.target_storage_path, webp, {
        cacheControl: "31536000",
        contentType: "image/webp",
        upsert: false,
      });
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    result.upload_status = "UPLOAD_SUCCESS";

    result.storage_url = await verifyObject(supabase, result.target_storage_path, targetSize);
    result.storage_verify_status = "STORAGE_VERIFY_SUCCESS";

    const updatedRows = await databaseQuery(
      projectRef,
      `update public."11_tire_model"
       set main_image_url = $1
       where tire_model_key = $2
         and coalesce(btrim(main_image_url), '') = ''
       returning tire_model_key, model_name, main_image_url`,
      [result.target_storage_path, result.tire_model_key],
      false,
    );
    if (updatedRows.length !== 1) throw new Error("DB update guard rejected the row.");
    result.db_update_status = "DB_UPDATE_SUCCESS";

    const verifiedRows = await databaseQuery(
      projectRef,
      `select tire_model_key, model_name, main_image_url
       from public."11_tire_model"
       where tire_model_key = $1`,
      [result.tire_model_key],
    );
    const verified = verifiedRows[0];
    if (
      verifiedRows.length !== 1 ||
      verified.model_name !== result.model_name ||
      verified.main_image_url !== result.target_storage_path
    ) {
      throw new Error("DB verification mismatch.");
    }
    result.db_verify_status = "DB_VERIFY_SUCCESS";
    result.final_status = "SUCCESS";
  } catch (error) {
    result.error_message = safeError(error);
    if (result.convert_status === "NOT_RUN") {
      result.convert_status = "CONVERT_FAILED";
      result.final_status = "CONVERT_FAILED";
    } else if (result.upload_status === "NOT_RUN") {
      result.upload_status = "UPLOAD_FAILED";
      result.final_status = "UPLOAD_FAILED";
    } else if (result.storage_verify_status === "NOT_RUN") {
      result.storage_verify_status = "STORAGE_VERIFY_FAILED";
      result.final_status = "STORAGE_VERIFY_FAILED";
    } else if (result.db_update_status === "NOT_RUN") {
      result.db_update_status = "DB_UPDATE_FAILED";
      result.final_status = "DB_UPDATE_FAILED";
    } else {
      result.db_verify_status = "DB_VERIFY_FAILED";
      result.final_status = "DB_VERIFY_FAILED";
    }
  } finally {
    saveResults(results);
    console.log(`${result.tire_model_key || result.source_file}: ${result.final_status}`);
  }
}

const successful = results.filter((result) => result.final_status === "SUCCESS").length;
console.log(`Completed: ${successful}/20 SUCCESS`);
if (successful !== 20) process.exitCode = 2;
