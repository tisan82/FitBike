import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const CHUNK_SIZE = 60_000;
const MAX_BYTES = 4 * 1024 * 1024;

export async function handoffGeneratedWebP({
  filePath,
  pipelineImageId,
  claimToken,
  supabaseUrl = process.env.SUPABASE_URL,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY,
}) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_SERVER_CREDENTIALS_MISSING");
  const bytes = await readFile(filePath);
  if (bytes.length < 12 || bytes.length > MAX_BYTES) throw new Error("INVALID_WEBP_SIZE");
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") {
    throw new Error("INVALID_WEBP_SIGNATURE");
  }

  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const base64 = bytes.toString("base64");
  const chunks = [];
  for (let i = 0; i < base64.length; i += CHUNK_SIZE) chunks.push(base64.slice(i, i + CHUNK_SIZE));

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: handoffId, error: beginError } = await supabase.rpc(
    "content_pipeline_begin_generated_asset_handoff_v1",
    {
      p_pipeline_image_id: pipelineImageId,
      p_claim_token: claimToken,
      p_expected_sha256: sha256,
      p_expected_bytes: bytes.length,
      p_chunk_count: chunks.length,
    },
  );
  if (beginError || !handoffId) throw new Error(`HANDOFF_BEGIN_FAILED: ${beginError?.message ?? "missing id"}`);

  for (let seq = 0; seq < chunks.length; seq += 1) {
    const { error } = await supabase.rpc("content_pipeline_append_generated_asset_chunk_v1", {
      p_handoff_id: handoffId,
      p_seq: seq,
      p_chunk: chunks[seq],
    });
    if (error) throw new Error(`HANDOFF_CHUNK_FAILED_${seq}: ${error.message}`);
  }

  const { data: verify, error: verifyError } = await supabase.rpc(
    "content_pipeline_verify_generated_asset_handoff_v1",
    { p_handoff_id: handoffId },
  );
  if (verifyError || verify?.status !== "PASS" || verify?.sha256 !== sha256 || Number(verify?.bytes) !== bytes.length) {
    throw new Error(`HANDOFF_VERIFY_FAILED: ${verifyError?.message ?? JSON.stringify(verify)}`);
  }

  const { data: dispatch, error: dispatchError } = await supabase.rpc(
    "content_pipeline_dispatch_generated_asset_upload_v1",
    { p_pipeline_image_id: pipelineImageId, p_claim_token: claimToken, p_handoff_id: handoffId },
  );
  if (dispatchError || dispatch?.status !== "DISPATCHED") {
    throw new Error(`HANDOFF_DISPATCH_FAILED: ${dispatchError?.message ?? JSON.stringify(dispatch)}`);
  }

  return { handoffId, sha256, bytes: bytes.length, chunks: chunks.length, requestId: dispatch.requestId };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [filePath, imageId, claimToken] = process.argv.slice(2);
  if (!filePath || !imageId || !claimToken) {
    throw new Error("Usage: node scripts/content-pipeline-generated-asset-handoff.mjs <webp> <pipelineImageId> <claimToken>");
  }
  console.log(JSON.stringify(await handoffGeneratedWebP({
    filePath,
    pipelineImageId: Number(imageId),
    claimToken,
  })));
}
