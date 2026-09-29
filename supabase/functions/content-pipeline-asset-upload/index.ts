import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const BUCKET = "content-assets";
const CONTENT_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_KEY = /^(thumbnail|hero|body-[0-9]{2})$/;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const ticket = req.headers.get("x-fitbike-upload-ticket") ?? "";
    const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

    let pipelineId = 0;
    let contentKey = "";
    let assetKey = "";
    let replaceExisting = false;
    let handoffId = "";
    let bytes: Uint8Array | null = null;
    let handoffExpectedSha = "";
    let handoffExpectedBytes = 0;

    if (contentType.includes("application/json")) {
      const body = await req.json();
      pipelineId = Number(body.pipelineId);
      contentKey = String(body.contentKey ?? "");
      assetKey = String(body.assetKey ?? "");
      replaceExisting = body.replaceExisting === true;
      handoffId = String(body.handoffId ?? "");
      const imageBase64 = String(body.imageBase64 ?? "");
      if (handoffId) {
        // Resolved after the one-time upload ticket is validated.
      } else {
        if (!imageBase64 || imageBase64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 16) {
          return json({ error: "VALIDATION_ERROR" }, 422);
        }
        try {
          bytes = Uint8Array.from(atob(imageBase64), (ch) => ch.charCodeAt(0));
        } catch {
          return json({ error: "INVALID_BASE64" }, 422);
        }
      }
    } else if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      pipelineId = Number(form.get("pipelineId"));
      contentKey = String(form.get("contentKey") ?? "");
      assetKey = String(form.get("assetKey") ?? "");
      replaceExisting = String(form.get("replaceExisting") ?? "") === "true";
      const file = form.get("file");
      if (!(file instanceof File) || file.type !== "image/webp") {
        return json({ error: "VALIDATION_ERROR" }, 422);
      }
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      return json({ error: "UNSUPPORTED_CONTENT_TYPE" }, 415);
    }

    if (
      !Number.isSafeInteger(pipelineId) || pipelineId <= 0 ||
      !CONTENT_KEY.test(contentKey) || !ASSET_KEY.test(assetKey) || !ticket
    ) return json({ error: "VALIDATION_ERROR" }, 422);

    if (bytes && (bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES || !isWebP(bytes))) {
      return json({ error: "INVALID_WEBP" }, 422);
    }

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

    if (handoffId) {
      const { data: handoff, error: handoffError } = await supabase.rpc(
        "content_pipeline_consume_generated_asset_handoff_v1",
        { p_handoff_id: handoffId, p_pipeline_id: pipelineId, p_content_key: contentKey, p_asset_key: assetKey },
      );
      const row = Array.isArray(handoff) ? handoff[0] : null;
      if (handoffError || !row?.image_base64) return json({ error: "GENERATED_HANDOFF_INVALID" }, 409);
      try {
        bytes = Uint8Array.from(atob(String(row.image_base64)), (ch) => ch.charCodeAt(0));
      } catch {
        return json({ error: "GENERATED_HANDOFF_INVALID_BASE64" }, 422);
      }
      handoffExpectedSha = String(row.expected_sha256 ?? "");
      handoffExpectedBytes = Number(row.expected_bytes ?? 0);
    }

    if (!bytes || bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES || !isWebP(bytes)) {
      return json({ error: "INVALID_WEBP" }, 422);
    }
    const actualSha = await digest(bytes);
    if (handoffId && (actualSha !== handoffExpectedSha || bytes.length !== handoffExpectedBytes)) {
      return json({ error: "GENERATED_HANDOFF_INTEGRITY_MISMATCH" }, 422);
    }

    const objectPath = `contents/${contentKey}/${assetKey}.webp`;
    const sha256 = actualSha;

    const { data: existing, error: downloadError } = await supabase.storage.from(BUCKET).download(objectPath);
    if (existing && !downloadError) {
      const existingSha256 = await digest(new Uint8Array(await existing.arrayBuffer()));
      if (existingSha256 === sha256) {
        return json({ bucket: BUCKET, storagePath: objectPath, sha256, bytes: bytes.length, status: "REUSED" }, 200);
      }
      if (!replaceExisting) return json({ error: "ASSET_CONFLICT" }, 409);

      const { error: replaceError } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
        contentType: "image/webp",
        cacheControl: "3600",
        upsert: true,
      });
      if (replaceError) return json({ error: "STORAGE_REPLACE_FAILED", detail: replaceError.message }, 500);
      if (!(await verifyStored(supabase, objectPath, sha256))) return json({ error: "STORAGE_VERIFY_FAILED" }, 500);
      return json({ bucket: BUCKET, storagePath: objectPath, sha256, bytes: bytes.length, status: "REPLACED" }, 200);
    }

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType: "image/webp",
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) return json({ error: "STORAGE_UPLOAD_FAILED", detail: uploadError.message }, 500);
    if (!(await verifyStored(supabase, objectPath, sha256))) return json({ error: "STORAGE_VERIFY_FAILED" }, 500);

    return json({ bucket: BUCKET, storagePath: objectPath, sha256, bytes: bytes.length, status: "UPLOADED" }, 201);
  } catch (error) {
    return json({ error: "INTERNAL_ERROR", detail: error instanceof Error ? error.message : "unknown" }, 500);
  }
});

function isWebP(bytes: Uint8Array) {
  return bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

async function verifyStored(supabase: ReturnType<typeof createClient>, objectPath: string, expectedSha: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(objectPath);
  if (!data || error) return false;
  const storedBytes = new Uint8Array(await data.arrayBuffer());
  return isWebP(storedBytes) && await digest(storedBytes) === expectedSha;
}

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
