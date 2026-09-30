import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  inspectWebp,
  sha256,
  transformSource,
  validateTransform,
} from "./transform.ts";
import { downloadSource, sourceUrl } from "./source.ts";
const BUCKET = "content-pipeline-staging";
Deno.serve(async (req) => {
  if (req.method !== "POST") return out({ error: "METHOD_NOT_ALLOWED" }, 405);
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  let authorized = false, jobId = "";
  try {
    const b = await req.json();
    jobId = String(b.jobId ?? "");
    if (!/^[0-9a-f-]{36}$/.test(jobId)) {
      return out({ error: "INVALID_JOB_ID" }, 422);
    }
    const { data: j, error: authError } = await sb.rpc(
      "content_pipeline_consume_source_stage_ticket_v1",
      {
        p_job_id: jobId,
        p_ticket: req.headers.get("x-fitbike-source-stage-ticket") ?? "",
      },
    );
    if (authError || !j) {
      return out({ error: "SOURCE_STAGE_TICKET_INVALID" }, 401);
    }
    authorized = true;
    const s = j.spec;
    const u = sourceUrl(s.sourceAssetUrl);
    sourceUrl(s.sourcePageUrl);
    if (typeof s.sourceOwner !== "string" || !s.sourceOwner.trim()) {
      throw Error("SOURCE_PROVENANCE_REQUIRED");
    }
    if (
      s.rightsStatus != null &&
      (typeof s.rightsStatus !== "string" || !s.rightsStatus.trim())
    ) throw Error("SOURCE_PROVENANCE_REQUIRED");
    const transform = validateTransform(s.transform);
    const downloaded = await downloadSource(u.href);
    const source = downloaded.bytes, mime = downloaded.mime;
    const final = await transformSource(
        source,
        mime,
        transform,
        s.sourcePdfPage,
      ),
      proof = await inspectWebp(final.webp, "image/webp");
    const path = j.pipelineImageId
      ? `${j.pipelineId}/${j.pipelineImageId}/${proof.sha256}.webp`
      : `probes/${jobId}/${proof.sha256}.webp`;
    let read = await sb.storage.from(BUCKET).download(path);
    if (read.error || !read.data) {
      const { error } = await sb.storage.from(BUCKET).upload(path, final.webp, {
        contentType: "image/webp",
        upsert: false,
        cacheControl: "0",
      });
      if (error) throw Error("STAGING_UPLOAD_FAILED");
      read = await sb.storage.from(BUCKET).download(path);
    }
    if (read.error || !read.data) throw Error("STAGING_READBACK_FAILED");
    const verified = await inspectWebp(
      new Uint8Array(await read.data.arrayBuffer()),
      read.data.type,
    );
    if (
      verified.sha256 !== proof.sha256 || verified.bytes !== proof.bytes ||
      verified.width !== proof.width || verified.height !== proof.height
    ) throw Error("STAGING_IDENTITY_MISMATCH");
    const { data: preview, error: previewError } = await sb.storage.from(BUCKET)
      .createSignedUrl(path, 3600);
    if (previewError || !preview) throw Error("PREVIEW_URL_FAILED");
    const result = {
      ...verified,
      bucket: BUCKET,
      path,
      storageVerification: "PASS",
      sourceIngest: "PASS",
      transformVerification: "PASS",
      imageQa: "PENDING",
      mobileQa: "PENDING",
      imageSeoQa: "PENDING",
      previewUrl: preview.signedUrl,
      previewExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      provenance: {
        sourceAssetUrl: u.href,
        finalSourceAssetUrl: downloaded.finalUrl,
        sourceRedirects: downloaded.redirects,
        sourceCheckedAt: new Date().toISOString(),
        sourcePageUrl: s.sourcePageUrl ?? null,
        sourceOwner: s.sourceOwner ?? null,
        rightsStatus: s.rightsStatus ?? "PENDING_OPERATOR_APPROVAL",
        sourceMime: mime,
        sourceSha256: await sha256(source),
        sourcePdfPage: s.sourcePdfPage ?? null,
      },
      transform,
      editingApplied: Boolean(transform.crop),
      annotationApplied: Boolean(transform.annotations?.length),
      stagedAt: new Date().toISOString(),
      probeOnly: !j.pipelineImageId,
    };
    const { error: saveError } = await sb.from(
      "27_content_pipeline_source_stage_job",
    ).update({ status: "STAGED", result, updated_at: new Date().toISOString() })
      .eq("job_id", jobId).eq("status", "RUNNING");
    if (saveError) throw Error("JOB_RECEIPT_SAVE_FAILED");
    return out({ jobId, status: "STAGED", result }, 200);
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e);
    if (authorized) {
      const failed = await sb.from("27_content_pipeline_source_stage_job")
        .update({
          status: "FAILED",
          failure_code: code.slice(0, 200),
          updated_at: new Date().toISOString(),
        }).eq("job_id", jobId).eq("status", "RUNNING");
      if (failed.error) {
        return out({ error: code, failureRecord: "FAILED" }, 500);
      }
    }
    return out({ error: code }, 422);
  }
});
function out(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
