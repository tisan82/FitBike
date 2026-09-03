import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = (process.env.FITBIKE_SITE_URL || "https://fitbike.co.kr").replace(/\/$/, "");
const targetIds = (process.env.CONTENT_IMAGE_MIGRATION_IDS || "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter(Number.isFinite);

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseHost = new URL(supabaseUrl).hostname;
const siteHost = new URL(siteUrl).hostname;

function isExternalImage(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return false;
  const hostname = new URL(value).hostname;
  return hostname !== siteHost && hostname !== supabaseHost;
}

function hashSource(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function optimizerUrl(sourceUrl, width = 1200, quality = 80) {
  return `${siteUrl}/_next/image?url=${encodeURIComponent(sourceUrl)}&w=${width}&q=${quality}`;
}

async function fetchOptimizedWebp(sourceUrl) {
  const response = await fetch(optimizerUrl(sourceUrl), {
    headers: {
      Accept: "image/webp,image/*;q=0.8",
      "User-Agent": "FitBike-Content-Asset-Migration/1.0",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`optimizer failed ${response.status} for ${sourceUrl}`);
  }
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("image/webp")) {
    throw new Error(`optimizer did not return WebP (${contentType || "unknown"}) for ${sourceUrl}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error(`empty optimized image for ${sourceUrl}`);
  return buffer;
}

async function ensureStored(sourceUrl) {
  const hash = hashSource(sourceUrl);
  const storagePath = `external-migrated/${hash}.webp`;
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/content-assets/${storagePath}`;

  const head = await fetch(publicUrl, { method: "HEAD" });
  if (!head.ok) {
    const buffer = await fetchOptimizedWebp(sourceUrl);
    const { error } = await supabase.storage
      .from("content-assets")
      .upload(storagePath, buffer, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
    if (error && !/already exists|Duplicate/i.test(error.message || "")) {
      throw new Error(`storage upload failed for ${sourceUrl}: ${error.message}`);
    }
  }

  const verify = await fetch(publicUrl, { method: "HEAD" });
  if (!verify.ok) throw new Error(`stored image verify failed ${verify.status}: ${publicUrl}`);
  const storedType = (verify.headers.get("content-type") || "").toLowerCase();
  if (!storedType.includes("image/webp")) {
    throw new Error(`stored object is not WebP (${storedType || "unknown"}): ${publicUrl}`);
  }
  return { storagePath, publicUrl };
}

function collectExternalUrlsFromBlocks(blocks, urls) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (isExternalImage(block.storagePath)) urls.add(block.storagePath);
    if (Array.isArray(block.images)) {
      for (const image of block.images) {
        if (image && isExternalImage(image.storagePath)) urls.add(image.storagePath);
      }
    }
  }
}

function rewriteBlocks(blocks, mapping) {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block) => {
    if (!block || typeof block !== "object") return block;
    const next = { ...block };
    if (mapping.has(next.storagePath)) next.storagePath = mapping.get(next.storagePath).storagePath;
    if (Array.isArray(next.images)) {
      next.images = next.images.map((image) => {
        if (!image || typeof image !== "object") return image;
        if (!mapping.has(image.storagePath)) return image;
        return { ...image, storagePath: mapping.get(image.storagePath).storagePath };
      });
    }
    return next;
  });
}

function hasExternalContentImage(content) {
  if (isExternalImage(content.hero_image_storage_path)) return true;
  if (isExternalImage(content.thumbnail_image_storage_path)) return true;
  const urls = new Set();
  collectExternalUrlsFromBlocks(content.body_blocks, urls);
  return urls.size > 0;
}

let query = supabase
  .from("12_content")
  .select("content_id,content_key,title,hero_image_storage_path,thumbnail_image_storage_path,body_blocks,is_active")
  .eq("is_active", true)
  .order("content_id", { ascending: true });
if (targetIds.length) query = query.in("content_id", targetIds);

const { data: contents, error: readError } = await query;
if (readError) throw readError;

const candidates = (contents || []).filter(hasExternalContentImage);
const allUrls = new Set();
for (const content of candidates) {
  if (isExternalImage(content.hero_image_storage_path)) allUrls.add(content.hero_image_storage_path);
  if (isExternalImage(content.thumbnail_image_storage_path)) allUrls.add(content.thumbnail_image_storage_path);
  collectExternalUrlsFromBlocks(content.body_blocks, allUrls);
}

console.log(JSON.stringify({ stage: "DISCOVERY", candidateContents: candidates.map((c) => c.content_id), externalUniqueImages: allUrls.size }, null, 2));

const mapping = new Map();
for (const sourceUrl of allUrls) {
  const stored = await ensureStored(sourceUrl);
  mapping.set(sourceUrl, stored);
  console.log(JSON.stringify({ stage: "ASSET_STORED", sourceUrl, storagePath: stored.storagePath }, null, 2));
}

for (const content of candidates) {
  const hero = mapping.get(content.hero_image_storage_path)?.storagePath || content.hero_image_storage_path;
  const thumbnail = mapping.get(content.thumbnail_image_storage_path)?.storagePath || content.thumbnail_image_storage_path;
  const bodyBlocks = rewriteBlocks(content.body_blocks, mapping);

  const { error: updateError } = await supabase
    .from("12_content")
    .update({
      hero_image_storage_path: hero,
      thumbnail_image_storage_path: thumbnail,
      body_blocks: bodyBlocks,
      updated_at: new Date().toISOString(),
    })
    .eq("content_id", content.content_id);
  if (updateError) throw updateError;

  console.log(JSON.stringify({ stage: "CONTENT_UPDATED", contentId: content.content_id, contentKey: content.content_key }, null, 2));
}

for (const [sourceUrl, stored] of mapping.entries()) {
  const { data: rows, error: sourceReadError } = await supabase
    .from("17_content_asset_source")
    .select("content_asset_source_id,edit_description")
    .or(`source_asset_url.eq.${sourceUrl},storage_path.eq.${sourceUrl}`);
  if (sourceReadError) throw sourceReadError;

  for (const row of rows || []) {
    const previous = row.edit_description?.trim();
    const migrationNote = "FitBike Production delivery용 1200px WebP 최적화 및 content-assets 내재화";
    const editDescription = previous ? `${previous}; ${migrationNote}` : migrationNote;
    const { error: sourceUpdateError } = await supabase
      .from("17_content_asset_source")
      .update({
        storage_path: stored.storagePath,
        edited: true,
        edit_description: editDescription,
        used_in_service: true,
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("content_asset_source_id", row.content_asset_source_id);
    if (sourceUpdateError) throw sourceUpdateError;
  }
}

let verifyQuery = supabase
  .from("12_content")
  .select("content_id,content_key,hero_image_storage_path,thumbnail_image_storage_path,body_blocks,is_active")
  .eq("is_active", true)
  .order("content_id", { ascending: true });
if (targetIds.length) verifyQuery = verifyQuery.in("content_id", targetIds);
const { data: verifiedContents, error: verifyReadError } = await verifyQuery;
if (verifyReadError) throw verifyReadError;

const remaining = (verifiedContents || []).filter(hasExternalContentImage);
if (remaining.length) {
  throw new Error(`EXTERNAL_HOTLINK remains in content ids: ${remaining.map((c) => c.content_id).join(",")}`);
}

for (const content of candidates) {
  const url = `${siteUrl}/contents/${encodeURIComponent(content.content_key)}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`production page failed ${response.status}: ${url}`);
}

console.log(JSON.stringify({
  status: "PUBLISHED_VERIFIED",
  migratedContents: candidates.map((c) => ({ contentId: c.content_id, contentKey: c.content_key })),
  migratedUniqueImages: mapping.size,
  remainingExternalHotlinks: 0,
}, null, 2));
