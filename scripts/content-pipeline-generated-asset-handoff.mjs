import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Worker-owned final WebP -> atomic server-side handoff + pg_net dispatch.
 * One client RPC only. The server validates bytes/SHA/WebP, creates chunks,
 * verifies the handoff, issues the upload ticket and dispatches Asset Upload.
 */
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
  const imageBase64 = bytes.toString("base64");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc(
    "content_pipeline_stage_and_dispatch_generated_asset_v1",
    {
      p_pipeline_image_id: pipelineImageId,
      p_claim_token: claimToken,
      p_image_base64: imageBase64,
      p_expected_sha256: sha256,
      p_expected_bytes: bytes.length,
    },
  );

  if (error || data?.status !== "DISPATCHED") {
    throw new Error(`GENERATED_ASSET_STAGE_DISPATCH_FAILED: ${error?.message ?? JSON.stringify(data)}`);
  }

  return data;
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
