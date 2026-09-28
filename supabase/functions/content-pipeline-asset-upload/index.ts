import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const BUCKET = "content-assets";
const CONTENT_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_KEY = /^(thumbnail|hero|body-[0-9]{2})$/;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const form = await req.formData();
    const pipelineId = Number(form.get("pipelineId"));
    const contentKey = String(form.get("contentKey") ?? "");
    const assetKey = String(form.get("assetKey") ?? "");
    const ticket = req.headers.get("x-fitbike-upload-ticket") ?? "";
    const file = form.get("file");

    if (
      !Number.isSafeInteger(pipelineId) || pipelineId <= 0 ||
      !CONTENT_KEY.test(contentKey) || !ASSET_KEY.test(assetKey) ||
      !(file instanceof File) || file.type !== "image/webp" ||
      file.size < 1 || file.size > MAX_IMAGE_BYTES || !ticket
    ) return json({ error: "VALIDATION_ERROR" }, 422);

    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "SERVER_CONFIG_ERROR" }, 500);

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authorized, error: ticketError } = await supabase.rpc(
      "content_pipeline_consume_asset_upload_ticket_v1",
      { p_pipeline_id: pipelineId, p_content_key: contentKey, p_asset_key: assetKey, p_ticket: ticket },
    );
    if (ticketError || authorized !== true) return json({ error: "UPLOAD_TICKET_INVALID" }, 401);

    const objectPath = `contents/${contentKey}/${assetKey}.webp`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sha256 = await digest(bytes);

    const { data: existing, error: downloadError } = await supabase.storage.from(BUCKET).download(objectPath);
    if (existing && !downloadError) {
      const existingSha256 = await digest(new Uint8Array(await existing.arrayBuffer()));
      if (existingSha256 !== sha256) return json({ error: "ASSET_CONFLICT" }, 409);
      return json({ bucket: BUCKET, storagePath: objectPath, sha256, status: "REUSED" }, 200);
    }

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: "image/webp",
      upsert: false,
    });
    if (uploadError) return json({ error: "STORAGE_UPLOAD_FAILED", detail: uploadError.message }, 500);

    const { data: verify, error: verifyError } = await supabase.storage.from(BUCKET).download(objectPath);
    if (!verify || verifyError) return json({ error: "STORAGE_VERIFY_FAILED" }, 500);
    if (await digest(new Uint8Array(await verify.arrayBuffer())) !== sha256) {
      return json({ error: "STORAGE_VERIFY_FAILED" }, 500);
    }

    return json({ bucket: BUCKET, storagePath: objectPath, sha256, status: "UPLOADED" }, 201);
  } catch {
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
});

async function digest(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
