import { createHash } from "node:crypto";

import { createContentFactorySupabaseClient } from "@/lib/supabase/content-factory";
import type { PublishRequest, QueueUpdate } from "@/lib/content-factory/schemas";

const BUCKET = "content-assets";

export async function findNextContentFactoryTopic() {
  const { data, error } = await createContentFactorySupabaseClient().rpc("content_factory_next_topic_v1");
  if (error) throw new Error(`CONTENT_FACTORY_QUEUE_READ_FAILED:${error.message}`);
  return data ?? null;
}

export async function updateContentFactoryTopic(topicKey: string, update: QueueUpdate) {
  const { data, error } = await createContentFactorySupabaseClient().rpc("content_factory_update_topic_v1", {
    p_topic_key: topicKey,
    p_expected_status: update.expectedStatus,
    p_next_status: update.status,
    p_last_error: update.lastError ?? null,
  });
  if (error) throw new Error(`CONTENT_FACTORY_QUEUE_UPDATE_FAILED:${error.message}`);
  return data;
}

export async function publishContentFactoryPackage(payload: PublishRequest) {
  const { data, error } = await createContentFactorySupabaseClient().rpc("content_factory_publish_v1", {
    p_payload: payload,
  });
  if (error) throw new Error(`CONTENT_FACTORY_PUBLISH_FAILED:${error.message}`);
  return data;
}

export async function uploadContentFactoryAsset(objectPath: string, bytes: Uint8Array) {
  const client = createContentFactorySupabaseClient();
  const expectedHash = createHash("sha256").update(bytes).digest("hex");
  const { data: existing, error: downloadError } = await client.storage.from(BUCKET).download(objectPath);

  if (existing && !downloadError) {
    const existingHash = createHash("sha256").update(Buffer.from(await existing.arrayBuffer())).digest("hex");
    if (existingHash !== expectedHash) throw new Error("CONTENT_FACTORY_ASSET_CONFLICT");
    return { bucket: BUCKET, storagePath: objectPath, sha256: expectedHash, status: "REUSED" as const };
  }

  const { error } = await client.storage.from(BUCKET).upload(objectPath, bytes, {
    contentType: "image/webp",
    upsert: false,
  });
  if (error) throw new Error(`CONTENT_FACTORY_ASSET_UPLOAD_FAILED:${error.message}`);
  return { bucket: BUCKET, storagePath: objectPath, sha256: expectedHash, status: "UPLOADED" as const };
}
