import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.30";

const wasmBytes = await Deno.readFile(new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.30")));
await initializeImageMagick(wasmBytes);

const MAX_SOURCE = 8 * 1024 * 1024;
const MAX_FINAL = 4 * 1024 * 1024;
const BUCKET = "content-assets";
const CONTENT_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_KEY = /^(thumbnail|hero|body-[0-9]{2})$/;

Deno.serve(async (req) => {
  if (req.method !== "POST") return out({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await req.json();
    const pipelineId = Number(body.pipelineId);
    const pipelineImageId = Number(body.pipelineImageId);
    const contentKey = String(body.contentKey ?? "");
    const assetKey = String(body.assetKey ?? "");
    const sourceAssetUrl = String(body.sourceAssetUrl ?? "");
    const ticket = req.headers.get("x-fitbike-source-ingest-ticket") ?? "";

    if (!Number.isSafeInteger(pipelineId) || !Number.isSafeInteger(pipelineImageId) ||
        !CONTENT_KEY.test(contentKey) || !ASSET_KEY.test(assetKey) || !ticket) {
      return out({ error: "VALIDATION_ERROR" }, 422);
    }

    const source = new URL(sourceAssetUrl);
    if (!["https:", "http:"].includes(source.protocol) || blockedHost(source.hostname)) {
      return out({ error: "SOURCE_URL_BLOCKED" }, 422);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: authorized, error: ticketError } = await supabase.rpc(
      "content_pipeline_consume_source_ingest_ticket_v1",
      {
        p_pipeline_id: pipelineId,
        p_pipeline_image_id: pipelineImageId,
        p_content_key: contentKey,
        p_asset_key: assetKey,
        p_ticket: ticket,
      },
    );
    if (ticketError || authorized !== true) return out({ error: "SOURCE_INGEST_TICKET_INVALID" }, 401);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 12_000);
    const response = await fetch(source, {
      signal: controller.signal,
      redirect: "error",
      headers: {
        "user-agent": "FitBike-Content-Source-Ingest/1.0",
        accept: "image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
    });
    if (!response.ok) return out({ error: "SOURCE_HTTP_ERROR", status: response.status }, 502);

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      return out({ error: "SOURCE_CONTENT_TYPE_INVALID", contentType }, 422);
    }

    const sourceBuffer = await response.arrayBuffer();
    if (sourceBuffer.byteLength < 1 || sourceBuffer.byteLength > MAX_SOURCE) {
      return out({ error: "SOURCE_FILE_SIZE_INVALID", bytes: sourceBuffer.byteLength }, 422);
    }

    let width = 0;
    let height = 0;
    const webp = ImageMagick.read(new Uint8Array(sourceBuffer), (image) => {
      width = image.width;
      height = image.height;
      if (width > 2000 || height > 2000) {
        const ratio = Math.min(2000 / width, 2000 / height);
        image.resize(Math.round(width * ratio), Math.round(height * ratio));
        width = image.width;
        height = image.height;
      }
      return image.write(MagickFormat.WebP, (data) => data);
    });

    if (webp.length < 1 || webp.length > MAX_FINAL) {
      return out({ error: "FINAL_FILE_SIZE_INVALID", bytes: webp.length }, 422);
    }

    const hash = await crypto.subtle.digest("SHA-256", webp);
    const sha256 = Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, "0")).join("");
    const storagePath = `contents/${contentKey}/${assetKey}.webp`;

    const { data: existing, error: existingError } = await supabase.storage.from(BUCKET).download(storagePath);
    if (existing && !existingError) {
      const bytes = new Uint8Array(await existing.arrayBuffer());
      const existingHash = await crypto.subtle.digest("SHA-256", bytes);
      const existingSha = Array.from(new Uint8Array(existingHash), (x) => x.toString(16).padStart(2, "0")).join("");
      if (existingSha !== sha256) return out({ error: "ASSET_CONFLICT" }, 409);
      return out({ status: "REUSED", bucket: BUCKET, storagePath, sha256, width, height, bytes: webp.length }, 200);
    }

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, webp, {
      contentType: "image/webp",
      upsert: false,
      metadata: {
        sourceAssetUrl,
        sourcePageUrl: String(body.sourcePageUrl ?? ""),
        sourceOwner: String(body.sourceOwner ?? ""),
        rightsStatus: String(body.rightsStatus ?? "PENDING_OPERATOR_APPROVAL"),
        pipelineImageId: String(pipelineImageId),
      },
    });
    if (uploadError) return out({ error: "STORAGE_UPLOAD_FAILED", detail: uploadError.message }, 500);

    const { data: verify, error: verifyError } = await supabase.storage.from(BUCKET).download(storagePath);
    if (!verify || verifyError) return out({ error: "STORAGE_VERIFY_FAILED" }, 500);
    const verifyBytes = new Uint8Array(await verify.arrayBuffer());
    const verifyHash = await crypto.subtle.digest("SHA-256", verifyBytes);
    const verifySha = Array.from(new Uint8Array(verifyHash), (x) => x.toString(16).padStart(2, "0")).join("");
    if (verifySha !== sha256) return out({ error: "STORAGE_VERIFY_FAILED" }, 500);

    return out({ status: "UPLOADED", bucket: BUCKET, storagePath, sha256, width, height, bytes: webp.length }, 201);
  } catch (error) {
    return out({ error: "INGEST_FAILED", detail: String(error) }, 502);
  }
});

function blockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
    /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host) || host === "::1";
}

function out(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
