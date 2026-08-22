import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../..");
const bucket = "tire-assets";
const modelKey = "MAXXIS_MA_RS";
const prefix = `tire-models/maxxis/${modelKey}`;
const mutate = process.argv.includes("--execute");
const slots = [
  { file: "main.webp", column: "main_image_url", width: 1200, height: 1200 },
  { file: "sub-01.webp", column: "sub_image_url_1", width: 1200, height: 900 },
  { file: "sub-02.webp", column: "sub_image_url_2", width: 1200, height: 900 },
];

function loadEnvironment() {
  const envFile = path.join(root, ".env.local");
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function privilegedKey(supabaseUrl) {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.SUPABASE_SECRET_KEY) return process.env.SUPABASE_SECRET_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("Mutation credential is unavailable.");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Supabase key lookup failed (${response.status}).`);
  const keys = await response.json();
  const key = keys.find((item) => item.name === "service_role") ?? keys.find((item) => item.type === "secret");
  if (!key?.api_key) throw new Error("No privileged Supabase key was returned.");
  return key.api_key;
}

async function databaseQuery(supabaseUrl, query, parameters = [], readOnly = true) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN is required for database operations.");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, parameters, read_only: readOnly }),
  });
  if (!response.ok) throw new Error(`Supabase database query failed (${response.status}).`);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : (payload.result ?? []);
}

loadEnvironment();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!supabaseUrl || !anonKey) throw new Error("Supabase public environment is incomplete.");

for (const slot of slots) {
  slot.localPath = path.join(root, "assets-source/tire-models/maxxis/upload", modelKey, slot.file);
  slot.objectPath = `${prefix}/${slot.file}`;
  const buffer = fs.readFileSync(slot.localPath);
  const metadata = await sharp(buffer).metadata();
  if (metadata.format !== "webp" || metadata.width !== slot.width || metadata.height !== slot.height || metadata.space !== "srgb" || buffer.length === 0) {
    throw new Error(`Local asset QA failed: ${slot.file}`);
  }
  slot.buffer = buffer;
  slot.size = buffer.length;
  slot.hash = sha256(buffer);
}

const readClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
const { data: beforeRows, error: beforeError } = await readClient
  .from("11_tire_model")
  .select("tire_model_id,tire_model_key,model_name,is_active,main_image_url,sub_image_url_1,sub_image_url_2")
  .eq("tire_model_key", modelKey);
if (beforeError) throw beforeError;
if (beforeRows.length !== 1 || !beforeRows[0].is_active) throw new Error("Active MA-RS model gate failed.");
const before = beforeRows[0];

const { data: existingObjects, error: listError } = await readClient.storage.from(bucket).list(prefix, { limit: 100 });
if (listError) throw listError;
const targetNames = new Set(slots.map((slot) => slot.file));
const collisions = existingObjects.filter((object) => targetNames.has(object.name));

console.log(JSON.stringify({ mode: mutate ? "EXECUTE" : "PREFLIGHT", bucket, prefix, local: slots.map(({ file, objectPath, size, hash }) => ({ file, objectPath, size, hash })), before, existingObjects: collisions.map(({ name, metadata }) => ({ name, size: metadata?.size ?? 0 })) }, null, 2));

if (!mutate) process.exit(0);
if (slots.some((slot) => before[slot.column] !== null)) throw new Error("Existing DB image path found; mutation stopped.");

const key = await privilegedKey(supabaseUrl);
const client = createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: buckets, error: bucketError } = await client.storage.listBuckets();
if (bucketError) throw bucketError;
const tireBucket = buckets.find((item) => item.id === bucket);
if (!tireBucket || !tireBucket.public) throw new Error("Public tire-assets bucket gate failed.");

for (const slot of slots) {
  const { data: objects, error: listExistingError } = await client.storage
    .from(bucket)
    .list(prefix, { search: slot.file, limit: 10 });
  if (listExistingError) throw listExistingError;
  const existing = objects.find((item) => item.name === slot.file);
  if (!existing) {
    const { error } = await client.storage.from(bucket).upload(slot.objectPath, slot.buffer, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });
    if (error) throw new Error(`${slot.file} upload failed: ${error.message}`);
    slot.uploadStatus = "UPLOADED";
  } else {
    const publicUrl = client.storage.from(bucket).getPublicUrl(slot.objectPath).data.publicUrl;
    const response = await fetch(publicUrl);
    const remoteBuffer = Buffer.from(await response.arrayBuffer());
    if (!response.ok || Number(existing.metadata?.size) !== slot.size || sha256(remoteBuffer) !== slot.hash) {
      throw new Error(`${slot.file} existing object differs from the approved local asset.`);
    }
    slot.uploadStatus = "REUSED_IDENTICAL";
  }
}

for (const slot of slots) {
  const { data: objects, error } = await client.storage.from(bucket).list(prefix, { search: slot.file, limit: 10 });
  if (error) throw error;
  const object = objects.find((item) => item.name === slot.file);
  if (!object || Number(object.metadata?.size) !== slot.size || (object.metadata?.mimetype ?? object.metadata?.contentType) !== "image/webp") {
    throw new Error(`${slot.file} storage verification failed.`);
  }
  const publicUrl = client.storage.from(bucket).getPublicUrl(slot.objectPath).data.publicUrl;
  const response = await fetch(publicUrl, { method: "HEAD" });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/webp") {
    throw new Error(`${slot.file} public HTTP verification failed (${response.status}).`);
  }
  slot.publicUrl = publicUrl;
}

const updateValues = Object.fromEntries(slots.map((slot) => [slot.column, slot.objectPath]));
const updatedRows = await databaseQuery(
  supabaseUrl,
  `update public."11_tire_model"
   set main_image_url = $1,
       sub_image_url_1 = $2,
       sub_image_url_2 = $3
   where tire_model_key = $4
     and is_active = true
     and main_image_url is null
     and sub_image_url_1 is null
     and sub_image_url_2 is null
   returning tire_model_key, main_image_url, sub_image_url_1, sub_image_url_2`,
  [updateValues.main_image_url, updateValues.sub_image_url_1, updateValues.sub_image_url_2, modelKey],
  false,
);
if (updatedRows.length !== 1) throw new Error("Guarded DB update rejected the row.");

const verifiedRows = await databaseQuery(
  supabaseUrl,
  `select tire_model_key, main_image_url, sub_image_url_1, sub_image_url_2
   from public."11_tire_model"
   where tire_model_key = $1`,
  [modelKey],
);
const verified = verifiedRows[0];
if (verifiedRows.length !== 1 || slots.some((slot) => verified[slot.column] !== slot.objectPath)) {
  throw new Error("DB verification failed.");
}
console.log(JSON.stringify({ status: "SUCCESS", storage: slots.map(({ objectPath, size, hash, publicUrl, uploadStatus }) => ({ objectPath, size, hash, publicUrl, uploadStatus })), database: verified }, null, 2));
