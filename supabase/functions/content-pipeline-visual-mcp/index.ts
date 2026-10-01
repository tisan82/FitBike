import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const url = Deno.env.get("SUPABASE_URL")!;
const endpoint = url + "/functions/v1/content-pipeline-visual-mcp";
const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const unitSchema = { type: "number", minimum: 0, maximum: 1 };
const transformSchema = {
  type: "object",
  properties: {
    maxWidth: { type: "integer", minimum: 390, maximum: 1600 },
    crop: {
      type: "object",
      properties: {
        x: unitSchema,
        y: unitSchema,
        width: unitSchema,
        height: unitSchema,
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: false,
    },
    annotations: {
      type: "array",
      maxItems: 6,
      items: {
        oneOf: [{
          type: "object",
          properties: {
            type: { const: "circle" },
            x: unitSchema,
            y: unitSchema,
            radius: { type: "number", exclusiveMinimum: 0, maximum: .5 },
          },
          required: ["type", "x", "y", "radius"],
          additionalProperties: false,
        }, {
          type: "object",
          properties: {
            type: { const: "arrow" },
            x1: unitSchema,
            y1: unitSchema,
            x2: unitSchema,
            y2: unitSchema,
          },
          required: ["type", "x1", "y1", "x2", "y2"],
          additionalProperties: false,
        }],
      },
    },
  },
  additionalProperties: false,
};
const tools = [
  {
    name: "check_visual_source_usage",
    description: "Check a verified source URL and optional source SHA against READY_FOR_UPLOAD/DONE images before editing. Requires this operator's claim receipt. URL-only clear is provisional, not permission or QA PASS. If duplicate, select another source within the same active claim; never alter URL/crop to bypass identity.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        sourceAssetUrl: { type: "string", format: "uri" },
        sourceSha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      },
      required: ["requestId", "sourceAssetUrl"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_visual_dispatch_result",
    description:
      "Recover this operator’s source dispatch by operationId after an interrupted response. Read-only; never creates another candidate.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        operationId: { type: "string", format: "uuid" },
      },
      required: ["requestId", "operationId"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "dispatch_visual_source",
    description:
      "Stage one public HTTPS photo/PDF candidate for this operator’s active image. Use one operationId per candidate/edit intent and retain it after response loss. Records provenance only. Supports crop, maxWidth and annotations[] circle/arrow; not AI Editing.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        operationId: { type: "string", format: "uuid" },
        spec: {
          type: "object",
          properties: {
            sourceAssetUrl: { type: "string" },
            sourcePageUrl: { type: "string" },
            sourceOwner: { type: "string" },
            sourcePdfPage: { type: "integer", minimum: 1, maximum: 500 },
            transform: transformSchema,
          },
          required: [
            "sourceAssetUrl",
            "sourcePageUrl",
            "sourceOwner",
            "transform",
          ],
          additionalProperties: false,
        },
      },
      required: ["requestId", "operationId", "spec"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "get_visual_source_status",
    description:
      "Read a same-contract candidate belonging to this operator’s image request. Does not claim, produce or approve an image.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        jobId: { type: "string", format: "uuid" },
      },
      required: ["requestId", "jobId"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "inspect_visual_source",
    description:
      "Download the exact private staged WebP, verify its SHA, bytes, signature and actual decode, then return image content plus a derived 390px preview. Human/model must inspect the returned pixels; technical PASS does not approve semantic QA.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        jobId: { type: "string", format: "uuid" },
      },
      required: ["requestId", "jobId"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "approve_visual_source",
    description:
      "Approve an inspected same-contract candidate for this active claim only. Requires expected SHA and explicit image/mobile/SEO evidence. Finishes at READY_FOR_UPLOAD, never production upload or DONE.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        jobId: { type: "string", format: "uuid" },
        expectedSha: { type: "string", pattern: "^[0-9a-f]{64}$" },
        qa: {
          type: "object",
          description: "Use exact flat field names. Inspect actual pixels before reporting PASS. THUMBNAIL requires representativeImageQa/cardCropQa; HERO requires representativeImageQa/heroCropQa; THUMBNAIL_HERO requires all three. A 390px preview alone does not prove card/hero crop suitability. Extra evidence fields are preserved.",
          properties: {
            contractHash: { type: "string", description: "Current claim generationContractHash, unchanged." },
            imageQa: { type: "string", enum: ["PASS"] },
            mobileQa: { type: "string", enum: ["PASS"] },
            imageSeoQa: { type: "string", enum: ["PASS"] },
            representativeImageQa: { type: "string", enum: ["PASS"], description: "Required for THUMBNAIL, HERO and THUMBNAIL_HERO after representative suitability inspection." },
            cardCropQa: { type: "string", enum: ["PASS"], description: "Required for THUMBNAIL and THUMBNAIL_HERO after actual card crop inspection." },
            heroCropQa: { type: "string", enum: ["PASS"], description: "Required for HERO and THUMBNAIL_HERO after actual hero crop inspection." },
          },
          required: ["contractHash", "imageQa", "mobileQa", "imageSeoQa"],
          additionalProperties: true,
        },
      },
      required: ["requestId", "jobId", "expectedSha", "qa"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_visual_queue_status",
    description:
      "Read current image production states without claiming or changing an image. Returns at most 25 images.",
    inputSchema: {
      type: "object",
      properties: { pipelineId: { type: "integer", minimum: 1 } },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "claim_visual_image",
    description:
      "Claim exactly one 3-A image. Generate one requestId per execution intent and reuse it after an interrupted response. A new request resumes this operator's existing active 3-A claim instead of claiming another image. Does not produce, upload or complete an image.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        pipelineImageId: { type: "integer", minimum: 1 },
      },
      required: ["requestId"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: "get_visual_claim_result",
    description:
      "Read the result of this operator's requestId after a response is lost. Does not create or renew a claim. Closed/expired requests cannot authorize writes.",
    inputSchema: {
      type: "object",
      properties: { requestId: { type: "string", format: "uuid" } },
      required: ["requestId"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "fail_visual_image",
    description:
      "Close only this operator's active 3-A image claim as RETRY or HOLD while preserving staged assets. Never completes or publishes an image.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        status: { type: "string", enum: ["RETRY", "HOLD"] },
        stage: { type: "string", maxLength: 100 },
        code: { type: "string", maxLength: 100 },
        error: { type: "string", maxLength: 2000 },
      },
      required: ["requestId", "status", "stage", "code", "error"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
function json(b: unknown, s = 200, h: Record<string, string> = {}) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "https://fitbike.co.kr",
      "vary": "Origin",
      ...h,
    },
  });
}
async function sourceUsage(imageId: number, sourceUrl: unknown, sourceSha?: unknown) {
  if (typeof sourceUrl !== "string" || sourceUrl.length > 4096) throw Error("INVALID_SOURCE_URL");
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw Error("INVALID_SOURCE_URL");
  if (sourceSha !== undefined && (typeof sourceSha !== "string" || !/^[a-f0-9]{64}$/.test(sourceSha))) throw Error("INVALID_SOURCE_SHA");
  const matches: Record<string, unknown>[] = [];
  for (const [field, value, matchedBy] of [
    ["staging_asset->qa->>sourceAssetUrl", sourceUrl, "SOURCE_URL"],
    ...(sourceSha ? [["staging_asset->qa->provenance->>sourceSha256", sourceSha, "SOURCE_SHA256"]] : []),
  ]) {
    const { data, error } = await sb.from("21_content_pipeline_image")
      .select("pipeline_image_id,pipeline_id,image_id,asset_key,status")
      .in("status", ["READY_FOR_UPLOAD", "DONE"]).neq("pipeline_image_id", imageId)
      .eq(field, value).limit(5);
    if (error) throw Error("SOURCE_USAGE_READ_FAILED");
    for (const row of data ?? []) matches.push({ ...row, matchedBy });
  }
  return { result: matches.length ? "DUPLICATE" : "NO_KNOWN_DUPLICATE", matches,
    identityScope: sourceSha ? "URL_AND_SOURCE_SHA256" : "EXACT_URL_ONLY",
    nextAction: matches.length ? "SELECT_DIFFERENT_SOURCE_SAME_CLAIM" : "CONTINUE_SOURCE_VALIDATION",
    finalApprovalGateRequired: true };
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw Error(error.message);
  return data;
}
Deno.serve(async (req) => {
  const path = new URL(req.url).pathname;
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "https://fitbike.co.kr",
        "access-control-allow-methods": "POST,GET,OPTIONS",
        "access-control-allow-headers":
          "authorization,content-type,mcp-protocol-version",
        "vary": "Origin",
      },
    });
  }
  if (req.method === "GET" && path.endsWith("/oauth-protected-resource")) {
    return json({
      resource: endpoint,
      authorization_servers: [url + "/auth/v1"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["email"],
    });
  }
  const challenge = {
    "www-authenticate": 'Bearer resource_metadata="' + endpoint +
      '/oauth-protected-resource"',
  };
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return json({ error: "AUTHENTICATION_REQUIRED" }, 401, challenge);
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) {
    return json({ error: "INVALID_ACCESS_TOKEN" }, 401, challenge);
  }
  // Verified email and server-controlled allowlist; never user_metadata authorization.
  const allowed = (Deno.env.get("CONTENT_FACTORY_MCP_OPERATOR_EMAILS") ?? "")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) {
    return json({ error: "OPERATOR_CONFIGURATION_REQUIRED" }, 503);
  }
  if (
    !data.user.email_confirmed_at ||
    !allowed.includes((data.user.email ?? "").toLowerCase())
  ) return json({ error: "OPERATOR_ACCESS_DENIED" }, 403);
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (Number(req.headers.get("content-length") ?? 0) > 16384) {
    return json({ error: "REQUEST_TOO_LARGE" }, 413);
  }
  let b: {
    id?: string | number | null;
    jsonrpc?: string;
    method?: string;
    params?: {
      protocolVersion?: string;
      name?: string;
      arguments?: {
        requestId?: string;
        operationId?: string;
        pipelineId?: number;
        pipelineImageId?: number;
        jobId?: string;
        expectedSha?: string;
        qa?: Record<string, unknown>;
        spec?: Record<string, unknown>;
        status?: string;
        stage?: string;
        code?: string;
        error?: string;
      };
    };
  };
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 16384) {
      return json({ error: "REQUEST_TOO_LARGE" }, 413);
    }
    b = JSON.parse(raw);
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) {
    return json({ error: "INVALID_JSON_RPC_OBJECT" }, 400);
  }
  const id = b.id ?? null;
  if (b.jsonrpc !== "2.0") {
    return json({
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: "Invalid JSON-RPC" },
    }, 400);
  }
  if (b.method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }
  const protocol = b.params?.protocolVersion ?? "";
  if (b.method === "initialize") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion:
          ["2024-11-05", "2025-03-26", "2025-06-18"].includes(protocol)
            ? protocol
            : "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "fitbike-visual-operations", version: "1.2.0" },
      },
    });
  }
  if (b.method === "ping") return json({ jsonrpc: "2.0", id, result: {} });
  if (b.method === "tools/list") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: tools.map((t) => ({
          ...t,
          securitySchemes: [{ type: "oauth2", scopes: ["email"] }],
          _meta: { securitySchemes: [{ type: "oauth2", scopes: ["email"] }] },
        })),
      },
    });
  }
  if (b.method !== "tools/call") {
    return json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" },
    });
  }
  const name = b.params?.name ?? "",
    a = b.params?.arguments ?? {},
    def = tools.find((t) => t.name === name);
  if (!def || typeof a !== "object" || Array.isArray(a) || a === null) {
    return json({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "Invalid tool arguments" },
    });
  }
  const keys = Object.keys(def.inputSchema.properties);
  if (
    Object.keys(a).some((k) => !keys.includes(k)) ||
    (def.inputSchema.required ?? []).some((k) => !(k in a))
  ) {
    return json({
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "Unexpected or missing argument" },
    });
  }
  const worker = "mcp-3a-" + data.user.id;
  try {
    let result;
    let images: Array<{ type: string; data: string; mimeType: string }> = [];
    if (name === "get_visual_queue_status") {
      if (
        a.pipelineId !== undefined &&
        (!Number.isSafeInteger(a.pipelineId) || a.pipelineId < 1)
      ) throw Error("INVALID_PIPELINE_ID");
      let q = sb.from("21_content_pipeline_image").select(
        "pipeline_image_id,pipeline_id,image_id,asset_key,status,handoff_phase,claimed_by,claim_expires_at,next_eligible_at,failure_stage,failure_code",
      ).in("status", ["PENDING", "RETRY", "PROCESSING", "READY_FOR_UPLOAD"])
        .order("pipeline_id").order("ordinal").limit(25);
      if (a.pipelineId !== undefined) q = q.eq("pipeline_id", a.pipelineId);
      const { data, error } = await q;
      if (error) throw Error(error.message);
      result = { images: data, limit: 25, workerKey: worker };
    } else {
      if (!uuid(a.requestId)) throw Error("INVALID_REQUEST_ID");
      if (name === "claim_visual_image") {
        if (
          a.pipelineImageId !== undefined &&
          (!Number.isSafeInteger(a.pipelineImageId) || a.pipelineImageId < 1)
        ) throw Error("INVALID_IMAGE_ID");
        result = await rpc("content_pipeline_claim_visual_request_v1", {
          p_worker_key: worker,
          p_request_id: a.requestId,
          p_pipeline_image_id: a.pipelineImageId ?? null,
        });
      } else {
        const current = await rpc(
          "content_pipeline_visual_claim_request_status_v1",
          { p_worker_key: worker, p_request_id: a.requestId },
        );
        if (name === "get_visual_claim_result") result = current;
        else if (name === "check_visual_source_usage") {
          if (!current.claim) throw Error("VISUAL_CLAIM_RECEIPT_REQUIRED");
          result = await sourceUsage(current.claim.pipelineImageId, a.sourceAssetUrl, a.sourceSha256);
        } else if (name === "get_visual_dispatch_result") {
          if (!uuid(a.operationId) || !current.claim) {
            throw Error("INVALID_SOURCE_REQUEST");
          }
          const { data: jobs, error: jobsError } = await sb.from(
            "27_content_pipeline_source_stage_job",
          ).select("job_id,contract_hash").eq(
            "pipeline_image_id",
            current.claim.pipelineImageId,
          ).eq("spec->visualMcpOperation->>workerKey", worker).eq(
            "spec->visualMcpOperation->>operationId",
            a.operationId,
          ).order("created_at", { ascending: false }).limit(1);
          if (jobsError) throw Error("SOURCE_JOB_READ_FAILED");
          if (!jobs?.length) {
            result = { result: "NOT_FOUND", operationId: a.operationId };
          } else if (
            jobs[0].contract_hash !== current.claim.generationContractHash
          ) throw Error("CONTRACT_CHANGED");
          else {result = await rpc("content_pipeline_source_stage_status_v1", {
              p_job_id: jobs[0].job_id,
            });}
        } else if (name === "dispatch_visual_source") {
          if (!current.activeClaim) throw Error("ACTIVE_VISUAL_CLAIM_REQUIRED");
          if (!uuid(a.operationId)) throw Error("INVALID_OPERATION_ID");
          validateSpec(a.spec);
          const usage = await sourceUsage(current.claim.pipelineImageId, a.spec.sourceAssetUrl);
          if (usage.result === "DUPLICATE") throw Error("DUPLICATE_SOURCE_PREFLIGHT: select a different source within the same claim; no candidate dispatched");
          result = await rpc(
            "content_pipeline_dispatch_visual_source_request_v1",
            {
              p_worker_key: worker,
              p_request_id: a.requestId,
              p_operation_id: a.operationId,
              p_spec: a.spec,
            },
          );
        } else if (
          [
            "get_visual_source_status",
            "inspect_visual_source",
            "approve_visual_source",
          ].includes(name)
        ) {
          if (!uuid(a.jobId) || !current.claim) {
            throw Error("INVALID_SOURCE_REQUEST");
          }
          const { data: job, error: jobError } = await sb.from(
            "27_content_pipeline_source_stage_job",
          ).select(
            "job_id,pipeline_image_id,contract_hash,status,result,approved_at",
          ).eq("job_id", a.jobId).maybeSingle();
          if (jobError) throw Error("SOURCE_JOB_READ_FAILED");
          if (
            !job || job.pipeline_image_id !== current.claim.pipelineImageId ||
            job.contract_hash !== current.claim.generationContractHash
          ) throw Error("SOURCE_JOB_ACCESS_DENIED");
          if (name === "get_visual_source_status") {
            result = await rpc("content_pipeline_source_stage_status_v1", {
              p_job_id: a.jobId,
            });
          } else if (name === "inspect_visual_source") {
            if (job.status !== "STAGED" || !job.result) {
              throw Error("SOURCE_NOT_STAGED");
            }
            const r = job.result;
            const expectedPath =
              `${current.claim.pipelineId}/${current.claim.pipelineImageId}/${r.sha256}.webp`;
            if (
              r.bucket !== "content-pipeline-staging" ||
              r.path !== expectedPath || !/^[a-f0-9]{64}$/.test(r.sha256) ||
              r.bytes < 12 || r.bytes > 4194304
            ) throw Error("STAGING_METADATA_INVALID");
            const { data: blob, error: readError } = await sb.storage.from(
              "content-pipeline-staging",
            ).download(r.path);
            if (readError || !blob) throw Error("STAGING_READBACK_FAILED");
            if (blob.size !== r.bytes || blob.type !== "image/webp") {
              throw Error("STAGING_IDENTITY_MISMATCH");
            }
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const { inspectPixels } = await import("./inspection.ts");
            const proof = await inspectPixels(bytes, r);
            result = {
              jobId: a.jobId,
              ...proof.metadata,
              technicalVerification: "PASS",
              semanticQa: "NOT_EVALUATED",
              mobilePreview: "DERIVED_390PX_NOT_CANONICAL",
              canonicalPath: r.path,
            };
            images = [{
              type: "image",
              data: encodeBase64(bytes),
              mimeType: "image/webp",
            }, {
              type: "image",
              data: encodeBase64(proof.mobile),
              mimeType: "image/png",
            }];
          } else {
            if (
              typeof a.expectedSha !== "string" ||
              !/^[a-f0-9]{64}$/.test(a.expectedSha) || !a.qa ||
              typeof a.qa !== "object" || Array.isArray(a.qa)
            ) throw Error("INVALID_APPROVAL");
            // Lost-response replay may only return this already-approved canonical asset.
            const { data: image, error: imageError } = await sb.from(
              "21_content_pipeline_image",
            ).select("status,handoff_phase,staging_asset").eq(
              "pipeline_image_id",
              job.pipeline_image_id,
            ).single();
            if (imageError) throw Error("IMAGE_STATE_READ_FAILED");
            if (
              job.approved_at && image.staging_asset?.sourceJobId === a.jobId &&
              image.staging_asset?.sha256 === a.expectedSha
            ) {
              result = {
                status: image.status,
                handoffPhase: image.handoff_phase,
                stagingAsset: image.staging_asset,
                replayed: true,
              };
            } else {
              if (!current.activeClaim) {
                throw Error("ACTIVE_VISUAL_CLAIM_REQUIRED");
              }
              const qa = a.qa;
              if (qa.contractHash !== current.claim.generationContractHash) {
                throw Error("QA_CONTRACT_HASH_MISMATCH: use current claim generationContractHash");
              }
              const role = String(current.claim.generationContract?.asset_role ?? "BODY").toUpperCase();
              const requiredQa = ["imageQa", "mobileQa", "imageSeoQa"];
              if (["THUMBNAIL", "HERO", "THUMBNAIL_HERO"].includes(role)) requiredQa.push("representativeImageQa");
              if (["THUMBNAIL", "THUMBNAIL_HERO"].includes(role)) requiredQa.push("cardCropQa");
              if (["HERO", "THUMBNAIL_HERO"].includes(role)) requiredQa.push("heroCropQa");
              const missingQa = requiredQa.filter((k) => qa[k] !== "PASS");
              if (missingQa.length) {
                throw Error(`EXPLICIT_QA_PASS_REQUIRED: assetRole=${role}; missingOrNonPass=${missingQa.join(",")}; use exact flat qa fields after actual inspection`);
              }
              await rpc("content_pipeline_approve_source_stage_v1", {
                p_job_id: a.jobId,
                p_claim_token: current.claim.claimToken,
                p_expected_sha: a.expectedSha,
                p_qa: a.qa,
              });
              const { data: done, error: doneError } = await sb.from(
                "21_content_pipeline_image",
              ).select("status,handoff_phase,staging_asset").eq(
                "pipeline_image_id",
                job.pipeline_image_id,
              ).single();
              if (
                doneError || done.status !== "READY_FOR_UPLOAD" ||
                done.handoff_phase !== "READY_FOR_UPLOAD" ||
                done.staging_asset?.sha256 !== a.expectedSha
              ) throw Error("READY_FOR_UPLOAD_READBACK_FAILED");
              result = {
                status: done.status,
                handoffPhase: done.handoff_phase,
                stagingAsset: done.staging_asset,
              };
            }
          }
        } else {
          if (
            (typeof a.status !== "string" ||
              !["RETRY", "HOLD"].includes(a.status)) ||
            !["stage", "code", "error"].every((k) => {
              const v = a[k as "stage" | "code" | "error"];
              return typeof v === "string" && v.length > 0 &&
                v.length <= (k === "error" ? 2000 : 100);
            })
          ) throw Error("INVALID_FAILURE");
          if (!current.activeClaim) result = current;
          else {
            await rpc("content_pipeline_fail_image_v1", {
              p_pipeline_image_id: current.claim.pipelineImageId,
              p_pipeline_image_run_id: current.claim.pipelineImageRunId,
              p_claim_token: current.claim.claimToken,
              p_failure_status: a.status,
              p_failure_stage: a.stage,
              p_failure_code: a.code,
              p_error: a.error,
              p_retry_action: "RESUME_LAST_SUCCESSFUL_STAGE",
              p_metadata: { transport: "VISUAL_MCP", requestId: a.requestId },
            });
            result = await rpc(
              "content_pipeline_visual_claim_request_status_v1",
              { p_worker_key: worker, p_request_id: a.requestId },
            );
            if (result.activeClaim || result.status !== a.status) {
              throw Error("FAIL_CLOSE_READBACK_FAILED");
            }
          }
        }
      }
    }
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        content: [{ type: "text", text: JSON.stringify(result) }, ...images],
        structuredContent: result,
      },
    });
  } catch (e) {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        isError: true,
        content: [{
          type: "text",
          text: e instanceof Error ? e.message : "VISUAL_OPERATION_FAILED",
        }],
      },
    });
  }
});

function encodeBase64(bytes: Uint8Array) {
  let b = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    b += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(b);
}
function validateSpec(raw: unknown) {
  const s = raw as Record<string, unknown>;
  if (
    !s || typeof s !== "object" || Array.isArray(s) ||
    Object.keys(s).some((k) =>
      ![
        "sourceAssetUrl",
        "sourcePageUrl",
        "sourceOwner",
        "sourcePdfPage",
        "transform",
      ].includes(k)
    )
  ) throw Error("INVALID_SOURCE_SPEC");
  for (const k of ["sourceAssetUrl", "sourcePageUrl"]) {
    const u = new URL(String(s[k]));
    if (
      u.protocol !== "https:" || u.username || u.password || u.port || u.hash
    ) throw Error("SOURCE_URL_UNSAFE");
  }
  if (
    typeof s.sourceOwner !== "string" || !s.sourceOwner.trim() ||
    s.sourceOwner.length > 500
  ) throw Error("SOURCE_PROVENANCE_REQUIRED");
  if (
    s.sourcePdfPage !== undefined &&
    (!Number.isInteger(s.sourcePdfPage) || Number(s.sourcePdfPage) < 1 ||
      Number(s.sourcePdfPage) > 500)
  ) throw Error("PDF_PAGE_INVALID");
  const t = s.transform as {
    maxWidth?: number;
    crop?: { x: number; y: number; width: number; height: number };
    annotations?: Array<
      {
        type: string;
        x: number;
        y: number;
        radius: number;
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      }
    >;
  };
  if (
    !t || typeof t !== "object" || Array.isArray(t) ||
    Object.keys(t).some((k) => !["crop", "maxWidth", "annotations"].includes(k))
  ) throw Error("UNSUPPORTED_TRANSFORM_USE_ANNOTATIONS_ARRAY");
  const unit = (x: unknown) =>
    typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
  if (
    t.maxWidth !== undefined &&
    (!Number.isInteger(t.maxWidth) || t.maxWidth < 390 || t.maxWidth > 1600)
  ) throw Error("INVALID_MAX_WIDTH");
  if (t.crop) {
    const c = t.crop;
    if (
      ![c.x, c.y, c.width, c.height].every(unit) || c.width <= 0 ||
      c.height <= 0 || c.x + c.width > 1 || c.y + c.height > 1
    ) throw Error("INVALID_CROP");
  }
  if (t.annotations !== undefined) {
    if (!Array.isArray(t.annotations) || t.annotations.length > 6) {
      throw Error("INVALID_ANNOTATION");
    }
    for (const a of t.annotations) {
      if (a.type === "circle") {
        if (
          ![a.x, a.y, a.radius].every(unit) || a.radius <= 0 || a.radius > .5
        ) throw Error("INVALID_ANNOTATION");
      } else if (a.type === "arrow") {
        if (
          ![a.x1, a.y1, a.x2, a.y2].every(unit) ||
          (a.x1 === a.x2 && a.y1 === a.y2)
        ) throw Error("INVALID_ANNOTATION");
      } else throw Error("UNSUPPORTED_ANNOTATION");
    }
  }
}
