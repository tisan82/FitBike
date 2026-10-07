import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  inspectWebp,
  sha256,
  transformSource,
  validateTransform,
} from "./transform.ts";
import { downloadSource, sourceUrl } from "./source.ts";
import { readStoredSourceCandidate } from "./source-resume.ts";
import { generateAsset, generationCapabilities } from "./generation.ts";
import { composeSources, validateComposition } from "./composition.ts";
const BUCKET = "content-pipeline-staging";
Deno.serve(async (req) => {
  if (req.method !== "POST") return out({ error: "METHOD_NOT_ALLOWED" }, 405);
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  let authorized = false, jobId = "";
  let activeSpec: Record<string, unknown> | null = null;
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
    activeSpec = s;
    if (s.capabilityProbe === true && !j.pipelineImageId) {
      const capabilities = generationCapabilities();
      const { error } = await sb.from("27_content_pipeline_source_stage_job")
        .update({
          status: "STAGED",
          result: { kind: "CAPABILITY_ONLY_NOT_IMAGE", capabilities },
          updated_at: new Date().toISOString(),
        }).eq("job_id", jobId).eq("status", "RUNNING");
      if (error) throw Error("CAPABILITY_RECEIPT_SAVE_FAILED");
      return out({ jobId, capabilities }, 200);
    }
    if (s.preflightOnly === true && (s.transform?.annotations?.length || s.composition?.sources?.some((x: { label?: string }) => x.label))) throw Error("PREFLIGHT_ANNOTATIONS_FORBIDDEN");
    const composite = s.composition !== undefined;
    if (composite && s.productionMethod) throw Error("COMPOSITION_GENERATION_CONFLICT");
    if (composite) {
      const c = validateComposition(s.composition);
      if (c.sources[0].sourceAssetUrl !== s.sourceAssetUrl || c.sources[0].sourcePageUrl !== s.sourcePageUrl || c.sources[0].sourceOwner !== s.sourceOwner) throw Error("COMPOSITION_PRIMARY_SOURCE_MISMATCH");
      if (s.transform?.crop || s.transform?.annotations?.length) throw Error("COMPOSITION_FINAL_TRANSFORM_NOT_ALLOWED");
    }
    const generative = Boolean(s.productionMethod);
    const u = generative ? null : sourceUrl(s.sourceAssetUrl);
    if (!generative) {
      sourceUrl(s.sourcePageUrl);
      if (typeof s.sourceOwner !== "string" || !s.sourceOwner.trim()) {
        throw Error("SOURCE_PROVENANCE_REQUIRED");
      }
    }
    const transform = validateTransform(s.transform);
    let contract: Record<string, unknown> = {};
    if (generative) {
      if (!j.pipelineImageId) throw Error("GENERATION_IMAGE_CLAIM_REQUIRED");
      const { data: image, error } = await sb.from("21_content_pipeline_image")
        .select("generation_contract,generation_contract_hash").eq(
          "pipeline_image_id",
          j.pipelineImageId,
        ).single();
      if (error || image.generation_contract_hash !== j.contractHash) {
        throw Error("GENERATION_CONTRACT_CHANGED");
      }
      contract = image.generation_contract;
      const { data: allowed, error: permissionError } = await sb.rpc(
        "content_pipeline_reference_generation_allowed_v1",
        {
          p_contract: contract,
          p_method: s.productionMethod,
        },
      );
      if (permissionError || allowed !== true) {
        throw Error("REFERENCE_GENERATION_CONTRACT_NOT_ALLOWED");
      }
    }
    let composed: Awaited<ReturnType<typeof composeSources>> | undefined;
    let downloaded;
    let sourceResume: Awaited<ReturnType<typeof readStoredSourceCandidate>> | undefined;
    const sourceParentId = !generative && !composite && s.preflightOnly !== true
      ? s.preStagingQa?.sourceJobId : undefined;
    if (sourceParentId) {
      const { data: previous, error } = await sb.from("27_content_pipeline_source_stage_job")
        .select("job_id,pipeline_image_id,contract_hash,status,spec,result")
        .eq("job_id", sourceParentId).single();
      if (error || !previous) throw Error("SOURCE_RESUME_ASSET_MISSING");
      const { data: candidate, error: candidateError } = await sb.rpc("content_pipeline_review_candidate_v1", {
        p_image_id: j.pipelineImageId, p_job_id: sourceParentId,
      });
      if (candidateError || !candidate || candidate.contractHash !== j.contractHash)
        throw Error("SOURCE_RESUME_CANDIDATE_INVALID");
      const { data: currentImage, error: imageError } = await sb.from("21_content_pipeline_image")
        .select("pipeline_id,generation_contract_hash,review_candidate,visual_phase").eq("pipeline_image_id", j.pipelineImageId).single();
      if (imageError || !currentImage || currentImage.pipeline_id !== j.pipelineId || currentImage.generation_contract_hash !== j.contractHash ||
          (currentImage.visual_phase === "REVIEWING" && currentImage.review_candidate?.jobId !== sourceParentId))
        throw Error("SOURCE_RESUME_CANDIDATE_INVALID");
      sourceResume = await readStoredSourceCandidate(j, { ...previous, pipeline_id: currentImage.pipeline_id },
        async (path) => {
          const read = await sb.storage.from(BUCKET).download(path);
          if (read.error || !read.data) throw Error("SOURCE_RESUME_ASSET_MISSING");
          return { bytes: new Uint8Array(await read.data.arrayBuffer()), mime: read.data.type };
        }, inspectWebp);
      downloaded = { bytes: sourceResume.bytes, mime: "image/webp",
        finalUrl: previous.result.provenance?.finalSourceAssetUrl ?? null,
        redirects: previous.result.provenance?.sourceRedirects ?? [] };
    } else if (generative && s.resumeJobId) {
      const { data: previous, error } = await sb.from(
        "27_content_pipeline_source_stage_job",
      )
        .select("pipeline_image_id,contract_hash,spec,result").eq(
          "job_id",
          s.resumeJobId,
        ).single();
      if (
        error || previous.pipeline_image_id !== j.pipelineImageId ||
        previous.contract_hash !== j.contractHash ||
        previous.spec.productionMethod !== s.productionMethod ||
        previous.spec.inputAssetUrl !== s.inputAssetUrl ||
        previous.spec.prompt !== s.prompt ||
        JSON.stringify(previous.spec.references) !==
          JSON.stringify(s.references) ||
        previous.spec.visualMcpOperation?.workerKey !==
          s.visualMcpOperation?.workerKey
      ) throw Error("GENERATION_RESUME_ACCESS_DENIED");
      const input = previous.result?.generatedInput;
      if (
        !input || input.bucket !== BUCKET ||
        input.path !==
          `${j.pipelineId}/${j.pipelineImageId}/${input.sha256}.webp`
      ) throw Error("GENERATION_RESUME_ASSET_MISSING");
      const read = await sb.storage.from(BUCKET).download(input.path);
      if (read.error || !read.data) {
        throw Error("GENERATION_RESUME_ASSET_MISSING");
      }
      const bytes = new Uint8Array(await read.data.arrayBuffer());
      const proof = await inspectWebp(bytes, read.data.type);
      if (proof.sha256 !== input.sha256 || proof.bytes !== input.bytes) {
        throw Error("GENERATION_RESUME_IDENTITY_MISMATCH");
      }
      downloaded = {
        bytes,
        mime: "image/webp",
        finalUrl: null,
        redirects: [],
        generation: previous.result.generation,
      };
    } else {
      if (composite) {
        const unannotated = { ...s.composition, sources: s.composition.sources.map((part: Record<string, unknown>) => { const copy = { ...part }; delete copy.label; return copy; }) };
        composed = await composeSources(unannotated, s.transform.maxWidth ?? 1170);
      }
      downloaded = composed
        ? { bytes: composed.webp, mime: "image/webp", finalUrl: null, redirects: [] }
        : generative
        ? await generateAsset(s)
        : await downloadSource(u!.href);
    }
    let generatedInput;
    if (generative) {
      // Preserve a decoded, normalized WebP before applying the requested transform.
      // PNG/JPEG and WebP inputs all get the same bounded server decode/encode path.
      if (downloaded.mime !== "image/webp") {
        const normalized = await transformSource(downloaded.bytes, downloaded.mime, { maxWidth: 1600 });
        downloaded = { ...downloaded, bytes: normalized.webp, mime: "image/webp" };
      }
      const inputProof = await inspectWebp(downloaded.bytes, downloaded.mime);
      const inputPath =
        `${j.pipelineId}/${j.pipelineImageId}/${inputProof.sha256}.webp`;
      let read = await sb.storage.from(BUCKET).download(inputPath);
      if (read.error || !read.data) {
        const { error } = await sb.storage.from(BUCKET).upload(
          inputPath,
          downloaded.bytes,
          { contentType: "image/webp", upsert: false, cacheControl: "0" },
        );
        if (error) throw Error("GENERATED_BINARY_PRESERVATION_FAILED");
        read = await sb.storage.from(BUCKET).download(inputPath);
      }
      if (read.error || !read.data) {
        throw Error("GENERATED_BINARY_READBACK_FAILED");
      }
      const proof = await inspectWebp(
        new Uint8Array(await read.data.arrayBuffer()),
        read.data.type,
      );
      if (
        proof.sha256 !== inputProof.sha256 || proof.bytes !== inputProof.bytes
      ) throw Error("GENERATED_BINARY_IDENTITY_MISMATCH");
      generatedInput = { ...proof, bucket: BUCKET, path: inputPath };
      const { data: saved, error } = await sb.from(
        "27_content_pipeline_source_stage_job",
      ).update({
        spec: scrubFileUrls(s),
        result: {
          checkpoint: "GENERATED_BINARY_PRESERVED",
          generatedInput,
          generation: "generation" in downloaded ? downloaded.generation : null,
        },
        updated_at: new Date().toISOString(),
      }).eq("job_id", jobId).eq("status", "RUNNING").select("job_id")
        .maybeSingle();
      if (error || !saved) throw Error("GENERATED_BINARY_RECEIPT_SAVE_FAILED");
    }
    const source = downloaded.bytes, mime = downloaded.mime;
    let preStagingGate: Record<string, unknown> | null = null;
    if (j.pipelineImageId) {
      const { data: gate, error: gateError } = await sb.rpc("content_pipeline_pre_staging_gate_v1", {
        p_image_id: j.pipelineImageId, p_contract_hash: j.contractHash,
        p_spec: s, p_source_sha: sourceResume?.sourceSha256 ?? await sha256(source),
      });
      if (gateError || !gate) throw Error(gateError?.message ?? "PRE_STAGING_VISUAL_QA_REQUIRED");
      preStagingGate = gate;
      if (gate.status === "PREFLIGHT_ONLY") {
        delete transform.annotations;
      }
    }

    if (composite && preStagingGate?.status === "PASS") {
      const pinned = { ...s.composition, sources: s.composition.sources.map((part: Record<string, unknown>, index: number) => ({ ...part, expectedSourceSha: composed!.provenance[index].sourceSha256 })) };
      composed = await composeSources(pinned, s.transform.maxWidth ?? 1170);
    }
    const final = composed ?? (sourceResume && !transform.annotations?.length
      ? { webp: source, width: sourceResume.width, height: sourceResume.height }
      : await transformSource(
        source,
        mime,
        sourceResume ? { maxWidth: sourceResume.width, annotations: transform.annotations } : transform,
        sourceResume ? undefined : s.sourcePdfPage,
      )),
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
      provenance: {
        ...(sourceResume ? sourceResume.provenance : {}),
        ...(composed ? { sources: composed.provenance, composition: composed.recipe, editingMethod: "DETERMINISTIC_SIDE_BY_SIDE" } : {}),
        sourceAssetUrl: u?.href ??
          (s.productionMethod === "REAL_SOURCE_AI_EDIT"
            ? s.inputAssetUrl
            : null),
        finalSourceAssetUrl: composed ? composed.provenance[0].finalSourceAssetUrl : downloaded.finalUrl,
        sourceRedirects: downloaded.redirects,
        sourceCheckedAt: sourceResume?.provenance.sourceCheckedAt ?? new Date().toISOString(),
        sourcePageUrl: s.sourcePageUrl ?? null,
        sourceOwner: s.sourceOwner ?? null,
        sourceMime: sourceResume?.provenance.sourceMime ?? (composed ? composed.provenance[0].sourceMime : mime),
        sourceSha256: composed ? composed.provenance[0].sourceSha256 : generative
          ? ("generation" in downloaded
            ? downloaded.generation.inputSourceSha256 ?? null
            : null)
          : sourceResume?.sourceSha256 ?? await sha256(source),
        generatedBinarySha256: generative
          ? ("generation" in downloaded ? downloaded.generation.inputSha256 ?? await sha256(source) : await sha256(source))
          : null,
        sourcePdfPage: s.sourcePdfPage ?? null,
        ...(generative
          ? {
            references: s.references,
            referenceEvidence: "OPERATOR_VERIFIED",
            inputAssetUrl: s.inputAssetUrl ?? null,
          }
          : {}),
      },
      ...(generative
        ? {
          productionMethod: s.productionMethod,
          generation: "generation" in downloaded ? downloaded.generation : null,
          generatedInput,
          references: s.references,
          aiEditingApplied: s.productionMethod === "REAL_SOURCE_AI_EDIT",
          aiGenerationApplied:
            ["REFERENCE_BASED_GENERATION", "NATIVE_FULL_GENERATION"].includes(s.productionMethod),
        }
        : {}),
      transform,
      editingApplied: Boolean(composed) || Boolean(transform.crop) ||
        s.productionMethod === "REAL_SOURCE_AI_EDIT",
      annotationApplied: Boolean(transform.annotations?.length),
      labelApplied: Boolean(composed?.recipe.sources.some(p => p.label)) || Boolean(transform.annotations?.some(a => a.type === "label")),
      stagedAt: new Date().toISOString(),
      probeOnly: !j.pipelineImageId || (s.preflightOnly === true || preStagingGate?.status === "PREFLIGHT_ONLY"),
      preflightOnly: s.preflightOnly === true || preStagingGate?.status === "PREFLIGHT_ONLY",
      preStagingGate,
      preStagingSourceSha256: sourceResume?.sourceSha256 ?? await sha256(source),
      ...(sourceResume ? { sourceResume: { sourceJobId: sourceParentId,
        canonicalSha256: sourceResume.canonicalSha256, strategy: "STORED_PREFLIGHT_ANNOTATION_ONLY" } } : {}),
    };
    // Preserve the verified candidate before the optional legacy inspection bridge.
    // A checkpoint is technical evidence only, never an approval or STAGED receipt.
    const { data: checkpoint, error: checkpointError } = await sb.from(
      "27_content_pipeline_source_stage_job",
    ).update({
      result: { ...result, checkpoint: "STORAGE_VERIFIED" },
      updated_at: new Date().toISOString(),
    })
      .eq("job_id", jobId).eq("status", "RUNNING").select("job_id")
      .maybeSingle();
    if (checkpointError || !checkpoint) {
      throw Error("JOB_CHECKPOINT_SAVE_FAILED");
    }

    const { data: preview, error: previewError } = await sb.storage.from(BUCKET)
      .createSignedUrl(path, 3600);
    if (previewError || !preview) throw Error("PREVIEW_URL_FAILED");
    Object.assign(result, {
      previewUrl: preview.signedUrl,
      previewExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    // Materialize the exact verified staged binary for independent pixel QA.
    // The bridge is service-role-only and chunked to keep each DB payload bounded.
    const { error: deleteError } = await sb.from(
      "28_content_pipeline_source_stage_inspection_chunk",
    )
      .delete().eq("job_id", jobId);
    if (deleteError) throw Error("INSPECTION_BRIDGE_WRITE_FAILED");
    const rows: Array<{ job_id: string; seq: number; chunk_base64: string }> =
      [];
    const inspectChunkBytes = 4500;
    for (
      let seq = 0, offset = 0;
      offset < final.webp.length;
      seq++, offset += inspectChunkBytes
    ) {
      const part = final.webp.subarray(
        offset,
        Math.min(offset + inspectChunkBytes, final.webp.length),
      );
      let binary = "";
      for (let i = 0; i < part.length; i++) {
        binary += String.fromCharCode(part[i]);
      }
      rows.push({ job_id: jobId, seq, chunk_base64: btoa(binary) });
    }

    for (let offset = 0; offset < rows.length; offset += 100) {
      const { error: chunkError } = await sb.from(
        "28_content_pipeline_source_stage_inspection_chunk",
      )
        .insert(rows.slice(offset, offset + 100));
      if (chunkError) throw Error("INSPECTION_BRIDGE_WRITE_FAILED");
    }
    const { data: saved, error: saveError } = await sb.from(
      "27_content_pipeline_source_stage_job",
    ).update({ status: "STAGED", result, updated_at: new Date().toISOString() })
      .eq("job_id", jobId).eq("status", "RUNNING").select("job_id")
      .maybeSingle();
    if (!saved || saveError) throw Error("JOB_RECEIPT_SAVE_FAILED");
    return out({ jobId, status: "STAGED", result }, 200);
  } catch (e) {
    const code = e instanceof Error ? e.message : String(e);
    if (authorized) {
      const failed = await sb.from("27_content_pipeline_source_stage_job")
        .update({
          status: "FAILED",
          ...(activeSpec ? { spec: scrubFileUrls(activeSpec) } : {}),
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

function scrubFileUrls(spec: Record<string, unknown>) {
  const out = { ...spec };
  for (const key of ["chatFile", "inputFile"]) {
    if (out[key] && typeof out[key] === "object") {
      const file = { ...(out[key] as Record<string, unknown>) };
      delete file.download_url;
      out[key] = file;
    }
  }
  return out;
}
