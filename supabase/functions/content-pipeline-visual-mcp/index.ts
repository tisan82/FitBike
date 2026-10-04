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
        }, {
          type: "object",
          properties: {
            type: { const: "label" }, text: { type: "string", minLength: 1, maxLength: 16 },
            x: unitSchema, y: unitSchema,
            fontSize: { type: "integer", minimum: 14, maximum: 24, description: "Pixels at 390px display width; default 16" },
          }, required: ["type", "text", "x", "y"], additionalProperties: false,
        }],
      },
    },
  },
  additionalProperties: false,
};
const fileSchema = {
  type: "object", properties: {
    download_url: { type: "string", format: "uri", maxLength: 4000 },
    file_id: { type: "string", minLength: 1, maxLength: 200 },
    mime_type: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
    file_name: { type: "string", maxLength: 255 },
  }, required: ["download_url", "file_id"], additionalProperties: false,
};
const UPLOAD_RESOURCE = "ui://fitbike/visual-file-upload-v1.html";
type VisualTool = {
  name: string; description: string;
  inputSchema: { type: string; properties: Record<string, unknown>; required?: string[]; additionalProperties: boolean };
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean; idempotentHint?: boolean };
  _meta?: Record<string, unknown>;
};
const tools: VisualTool[] = [
  {
    name: "get_visual_generation_capabilities",
    description:
      "Read native ChatGPT file-handoff support before Claim. External generation APIs are prohibited. Server generation booleans are false by design; check native generation in this chat separately. Automatic access to generated Chat files remains unverified; fileParams or the upload widget must supply an actual file.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "dispatch_visual_generation",
    description:
      "Ingest one image already generated or edited by native ChatGPT via top-level file (official fileParams), or verified generatedAssetUrl+SHA, or resumeJobId. Never invokes an external generation API. Requires active Claim and permitted same Contract. PNG/JPEG/WebP are decoded and normalized to private WebP; SHA is server-calculated for file inputs. Native AI edit also requires the exact original inputFile matching inputAssetUrl. Actual native editing is operator-attested, not performed by this server. Poll/inspect/approve existing tools; STAGED is not QA PASS.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        operationId: { type: "string", format: "uuid" },
        file: fileSchema,
        inputFile: fileSchema,
        spec: {
          type: "object",
          properties: {
            preflightOnly: { type: "boolean", description: "True: unannotated candidate preview only; inspect pixels before production." },
            preStagingQa: { type: "object", description: "Current task/Contract/source Job+SHA pixel attestation. Required for production. Get exact fields from get_visual_image_task.preStagingProtocol.", additionalProperties: true },
            productionMethod: {
              enum: ["REFERENCE_BASED_GENERATION", "REAL_SOURCE_AI_EDIT"],
            },
            prompt: { type: "string", minLength: 20, maxLength: 6000 },
            references: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  sourcePageUrl: { type: "string", format: "uri" },
                  sourceAssetUrl: { type: "string", format: "uri" },
                  sourceOwner: { type: "string", minLength: 1, maxLength: 200 },
                  verifiedFacts: {
                    type: "array",
                    minItems: 1,
                    maxItems: 10,
                    items: { type: "string", minLength: 1, maxLength: 500 },
                  },
                  pixelsInspected: { const: true },
                  checkedAt: { type: "string", format: "date-time" },
                },
                required: [
                  "sourcePageUrl",
                  "sourceOwner",
                  "verifiedFacts",
                  "pixelsInspected",
                  "checkedAt",
                ],
                additionalProperties: false,
              },
            },
            inputAssetUrl: { type: "string", format: "uri" },
            generatedAssetUrl: { type: "string", format: "uri" },
            resumeJobId: { type: "string", format: "uuid" },
            expectedGeneratedSha: { type: "string", pattern: "^[a-f0-9]{64}$" },
            transform: transformSchema,
          },
          required: ["productionMethod", "prompt", "references", "transform"],
          additionalProperties: false,
        },
      },
      required: ["requestId", "operationId", "spec"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },

  {
    name: "get_visual_image_task",
    description: "Read one exact image's current state and immutable generation Contract before Claim. Does not claim, modify or publish.",
    inputSchema: { type: "object", properties: { pipelineImageId: { type: "integer", minimum: 1 } }, required: ["pipelineImageId"], additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_visual_maintenance_status",
    description:
      "Read Storage/database usage and latest daily staging cleanup results. Does not claim, clean, approve or publish.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "check_visual_source_usage",
    description:
      "Check a verified source URL and optional source SHA against READY_FOR_UPLOAD/DONE images before editing. Requires this operator's claim receipt. URL-only clear is provisional, not permission or QA PASS. If duplicate, select another source within the same active claim; never alter URL/crop to bypass identity.",
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
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
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
      "Stage one public HTTPS photo/PDF candidate for this operator’s active image. Use one operationId per candidate/edit intent and retain it after response loss. Preserves provenance. Supports crop/maxWidth/circle/arrow and Korean label annotations (type=label,text,x,y,fontSize; max 16 characters; size in 390px display pixels). Coordinates refer to the cropped output; verify names and positions against the Contract. Also supports composition SIDE_BY_SIDE of 2–3 inspected raster sources with individual crop and short ASCII labels. No image generation; retain operationId for recovery.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", format: "uuid" },
        operationId: { type: "string", format: "uuid" },
        spec: {
          type: "object",
          properties: {
            preflightOnly: { type: "boolean", description: "True: unannotated candidate preview only; inspect pixels before production." },
            preStagingQa: { type: "object", description: "Current task/Contract/source Job+SHA pixel attestation. Required for production. Get exact fields from get_visual_image_task.preStagingProtocol.", additionalProperties: true },
            sourceAssetUrl: { type: "string" },
            sourcePageUrl: { type: "string" },
            sourceOwner: { type: "string" },
            sourcePdfPage: { type: "integer", minimum: 1, maximum: 500 },
            composition: {
              type: "object", additionalProperties: false,
              properties: {
                layout: { type: "string", enum: ["SIDE_BY_SIDE"] },
                sources: { type: "array", minItems: 2, maxItems: 3, items: {
                  type: "object", additionalProperties: false,
                  properties: {
                    sourceAssetUrl: { type: "string", format: "uri" },
                    sourcePageUrl: { type: "string", format: "uri" },
                    sourceOwner: { type: "string" },
                    verifiedFacts: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
                    pixelsInspected: { type: "boolean", const: true },
                    checkedAt: { type: "string", format: "date-time" },
                    expectedSourceSha: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    crop: transformSchema.properties.crop,
                    label: { type: "string", maxLength: 24, pattern: "^[A-Za-z0-9 &()+.,/-]{1,24}$" },
                  },
                  required: ["sourceAssetUrl", "sourcePageUrl", "sourceOwner", "verifiedFacts", "pixelsInspected", "checkedAt"],
                } },
              }, required: ["layout", "sources"],
            },
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
    name: "record_visual_source_qa",
    description: "Record actual pixel QA for a preflight candidate, bound to the current Task/Contract/source Job+SHA. Never approves or closes the Claim. Supply exact Contract strings in checks. Server validates attestation identity, not automated Vision.",
    inputSchema: { type:"object", additionalProperties:false,
      properties: {requestId:{type:"string",format:"uuid"},jobId:{type:"string",format:"uuid"},expectedSha:{type:"string",pattern:"^[a-f0-9]{64}$"},preStagingQa:{type:"object",additionalProperties:true}},
      required:["requestId","jobId","expectedSha","preStagingQa"] },
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },
  {
    name: "reject_visual_source",
    description: "Invalidate an actually inspected same-contract staged Job/SHA with semantic FAIL. Preserves bytes and history; keeps this Claim active for source replacement. Never use for unviewable pixels or technical delivery failures.",
    inputSchema: { type: "object", additionalProperties: false,
      properties: { requestId: {type:"string",format:"uuid"}, jobId: {type:"string",format:"uuid"}, expectedSha: {type:"string",pattern:"^[a-f0-9]{64}$"},
        reason: {type:"string",enum:["MUST_SHOW_MISMATCH","MUST_NOT_SHOW_VIOLATION","ANNOTATION_TARGET_MISMATCH","SOURCE_MISMATCH"]}, evidence: {type:"string",minLength:10,maxLength:2000} },
      required: ["requestId","jobId","expectedSha","reason","evidence"] },
    annotations: {readOnlyHint:false,destructiveHint:false,openWorldHint:false,idempotentHint:true},
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
          description:
            "Use exact flat field names. Inspect actual pixels before reporting PASS. THUMBNAIL requires representativeImageQa/cardCropQa; HERO requires representativeImageQa/heroCropQa; THUMBNAIL_HERO requires all three. A 390px preview alone does not prove card/hero crop suitability. Extra evidence fields are preserved.",
          properties: {
            contractHash: {
              type: "string",
              description: "Current claim generationContractHash, unchanged.",
            },
            imageQa: { type: "string", enum: ["PASS"] },
            mobileQa: { type: "string", enum: ["PASS"] },
            imageSeoQa: { type: "string", enum: ["PASS"] },
            representativeImageQa: {
              type: "string",
              enum: ["PASS"],
              description:
                "Required for THUMBNAIL, HERO and THUMBNAIL_HERO after representative suitability inspection.",
            },
            cardCropQa: {
              type: "string",
              enum: ["PASS"],
              description:
                "Required for THUMBNAIL and THUMBNAIL_HERO after actual card crop inspection.",
            },
            heroCropQa: {
              type: "string",
              enum: ["PASS"],
              description:
                "Required for HERO and THUMBNAIL_HERO after actual hero crop inspection.",
            },
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
      "Claim exactly one 3-A image. Generate one requestId per execution intent and reuse it after an interrupted response. Only the same requestId resumes a claim. A new request returns BUSY while another execution owns an active claim; never borrow its requestId. Does not produce, upload or complete an image.",
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
const generationTool = tools.find(t => t.name === "dispatch_visual_generation")!;
Object.assign(tools.find(t => t.name === "get_visual_dispatch_result")!, { _meta: { "openai/widgetAccessible": true, ui: { visibility: ["model", "app"] } } });
Object.assign(generationTool, { _meta: {
  "openai/fileParams": ["file", "inputFile"],
  "openai/widgetAccessible": true,
  ui: { visibility: ["model", "app"] },
} });
tools.push({
  name: "open_visual_file_upload",
  description: "Open an authenticated ChatGPT image-file upload/selection widget for this active Claim and a fixed generation spec. Does not dispatch or approve until the user selects a file. If Claim expires, use the normal same-image reclaim path; never upload into another image.",
  inputSchema: { type: "object", properties: {
    requestId: { type: "string", format: "uuid" }, operationId: { type: "string", format: "uuid" },
    spec: generationTool.inputSchema.properties.spec,
  }, required: ["requestId", "operationId", "spec"], additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: UPLOAD_RESOURCE }, "openai/outputTemplate": UPLOAD_RESOURCE },
} as typeof generationTool);

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
async function sourceUsage(
  imageId: number,
  sourceUrl: unknown,
  sourceSha?: unknown,
) {
  if (typeof sourceUrl !== "string" || sourceUrl.length > 4096) {
    throw Error("INVALID_SOURCE_URL");
  }
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw Error("INVALID_SOURCE_URL");
  }
  if (
    sourceSha !== undefined &&
    (typeof sourceSha !== "string" || !/^[a-f0-9]{64}$/.test(sourceSha))
  ) throw Error("INVALID_SOURCE_SHA");
  const matches: Record<string, unknown>[] = [];
  for (
    const [field, value, matchedBy] of [
      ["staging_asset->qa->>sourceAssetUrl", sourceUrl, "SOURCE_URL"],
      ...(sourceSha
        ? [[
          "staging_asset->qa->provenance->>sourceSha256",
          sourceSha,
          "SOURCE_SHA256",
        ]]
        : []),
    ]
  ) {
    const { data, error } = await sb.from("21_content_pipeline_image")
      .select("pipeline_image_id,pipeline_id,image_id,asset_key,status")
      .in("status", ["READY_FOR_UPLOAD", "DONE"]).neq(
        "pipeline_image_id",
        imageId,
      )
      .eq(field, value).limit(5);
    if (error) throw Error("SOURCE_USAGE_READ_FAILED");
    for (const row of data ?? []) matches.push({ ...row, matchedBy });
  }
  return {
    result: matches.length ? "DUPLICATE" : "NO_KNOWN_DUPLICATE",
    matches,
    identityScope: sourceSha ? "URL_AND_SOURCE_SHA256" : "EXACT_URL_ONLY",
    nextAction: matches.length
      ? "SELECT_DIFFERENT_SOURCE_SAME_CLAIM"
      : "CONTINUE_SOURCE_VALIDATION",
    finalApprovalGateRequired: true,
  };
}

function validateSpecTransform(transform: unknown) {
  validateSpec({
    sourceAssetUrl: "https://fitbike.co.kr/reference.jpg",
    sourcePageUrl: "https://fitbike.co.kr/contents",
    sourceOwner: "FitBike",
    transform,
  });
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
      uri?: string;
      arguments?: {
        requestId?: string;
        operationId?: string;
        pipelineId?: number;
        pipelineImageId?: number;
        jobId?: string;
        expectedSha?: string;
        sourceAssetUrl?: string;
        sourceSha256?: string;
        qa?: Record<string, unknown>;
        spec?: Record<string, unknown>;
        file?: Record<string, unknown>;
        inputFile?: Record<string, unknown>;
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
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "fitbike-visual-operations", version: "1.5.0" },
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
          _meta: { ...t._meta, securitySchemes: [{ type: "oauth2", scopes: ["email"] }] },
        })),
      },
    });
  }
  if (b.method === "resources/list") return json({ jsonrpc: "2.0", id, result: { resources: [{ uri: UPLOAD_RESOURCE, name: "FitBike image upload", mimeType: "text/html;profile=mcp-app" }] } });
  if (b.method === "resources/read") {
    if (b.params?.uri !== UPLOAD_RESOURCE) return json({ jsonrpc: "2.0", id, error: { code: -32602, message: "Unknown resource" } });
    const { uploadWidget } = await import("./upload-widget.ts");
    return json({ jsonrpc: "2.0", id, result: { contents: [{ uri: UPLOAD_RESOURCE, mimeType: "text/html;profile=mcp-app", text: uploadWidget,
      _meta: { ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } } },
    }] } });
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
    if (name === "get_visual_generation_capabilities") {
      const { generationCapabilities } = await import("./generation.ts");
      result = generationCapabilities();
    } else if (name === "get_visual_image_task") {
      if (!Number.isSafeInteger(a.pipelineImageId) || a.pipelineImageId! < 1) throw Error("INVALID_IMAGE_ID");
      const read = await sb.from("21_content_pipeline_image").select("pipeline_image_id,pipeline_id,image_id,status,handoff_phase,generation_contract,generation_contract_hash,claim_expires_at,next_eligible_at,staging_asset,retry_action").eq("pipeline_image_id", a.pipelineImageId).maybeSingle();
      if (read.error || !read.data) throw Error("IMAGE_TASK_NOT_FOUND");
      const image = read.data;
      // Avoid exposing private storage URLs or another worker's token.
      result = { pipelineImageId: image.pipeline_image_id, pipelineId: image.pipeline_id, imageId: image.image_id, status: image.status,
        handoffPhase: image.handoff_phase, generationContract: image.generation_contract, generationContractHash: image.generation_contract_hash,
        claimExpiresAt: image.claim_expires_at, nextEligibleAt: image.next_eligible_at,
        stagingSha: image.staging_asset?.sha256 ?? null };
      const recovery = await rpc("content_pipeline_visual_recovery_v1", { p_pipeline_image_id: image.pipeline_image_id });
      result.recoverableStaging = recovery;
      result.stagingSha ??= recovery?.sha256 ?? null;
      result.stagingApproved = !!image.staging_asset;
      result.preStagingProtocol = { phase1: "dispatch with spec.preflightOnly=true and no annotations; poll and inspect actual PNGs", phase2: "dispatch production with preStagingQa, same original source/PDF page or generation resumeJobId; final pixel QA still mandatory",
        qaFields: ["pipelineImageId","contractHash","sourceJobId","sourceSha256","pixelsInspected=true","status=PASS","evidence","mustShowChecks","mustNotShowChecks","inspectionTargetVerified=true","annotationTargetChecks"],
        checkKeys: "Use exact current Contract strings as keys, each inspected result PASS. SHA is preview result.preStagingSourceSha256 (inspection.sourceSha256), not provenance/source-original SHA.", evaluator:"OPERATOR_PIXEL_ATTESTATION", serverVisionSupported:false,
        rejection: "reject_visual_source after actual semantic FAIL; preserves Claim",
        schemaRefreshRequired: "Discover record_visual_source_qa and reject_visual_source before production. Missing attestation results in an unannotated preview only. Record actual QA, then dispatch same source with NEW operationId (native resumeJobId). Never send fake final-QA PASS to record preliminary checks.", };
      const { nativeGenerationContext } = await import("./generation.ts");
      result.nativeGenerationContext = nativeGenerationContext(image.pipeline_image_id, image.generation_contract_hash, image.generation_contract ?? {});
      result.nextAction = recovery && !image.staging_asset ? "INSPECT_EXISTING_STAGED_JOB" : image.retry_action === "SOURCE_SELECTION" ? "SELECT_NEW_SOURCE" : "FOLLOW_TASK_STATUS";
    } else if (name === "get_visual_maintenance_status") {
      result = await rpc("content_pipeline_staging_maintenance_status_v1", {});
    } else if (name === "get_visual_queue_status") {
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
        if (result?.claim) {
          const { nativeGenerationContext } = await import("./generation.ts");
          result.nativeGenerationContext = nativeGenerationContext(result.claim.pipelineImageId, result.claim.generationContractHash, result.claim.generationContract ?? {});
        }
      } else {
        const current = await rpc(
          "content_pipeline_visual_claim_request_status_v1",
          { p_worker_key: worker, p_request_id: a.requestId },
        );
        if (name === "get_visual_claim_result") {
          result = current;
          if (current.claim) {
            const { nativeGenerationContext } = await import("./generation.ts");
            result.nativeGenerationContext = nativeGenerationContext(current.claim.pipelineImageId, current.claim.generationContractHash, current.claim.generationContract ?? {});
          }
        }
        else if (name === "record_visual_source_qa") {
          result = await rpc("content_pipeline_register_pre_staging_qa_v1", {p_worker_key:worker,p_request_id:a.requestId,p_job_id:a.jobId,p_expected_sha:a.expectedSha,p_qa:a.preStagingQa});
        }
        else if (name === "reject_visual_source") {
          result = await rpc("content_pipeline_reject_visual_source_v1", {p_worker_key:worker,p_request_id:a.requestId,p_job_id:a.jobId,p_expected_sha:a.expectedSha,p_reason:a.reason,p_evidence:a.evidence});
        }
        else if (name === "check_visual_source_usage") {
          if (!current.claim) throw Error("VISUAL_CLAIM_RECEIPT_REQUIRED");
          result = await sourceUsage(
            current.claim.pipelineImageId,
            a.sourceAssetUrl,
            a.sourceSha256,
          );
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
        } else if (name === "dispatch_visual_generation" || name === "open_visual_file_upload") {
          if (!current.activeClaim) throw inactiveClaimError(current);
          if (!uuid(a.operationId)) throw Error("INVALID_OPERATION_ID");
          const { validateGenerationSpec } = await import("./generation.ts");
          // Only official top-level fileParams can populate these internal fields.
          if (a.spec && ("chatFile" in a.spec || "inputFile" in a.spec)) throw Error("USE_TOP_LEVEL_FILE_PARAMS");
          const spec = validateGenerationSpec({ ...a.spec, ...(a.file ? { chatFile: a.file } : {}), ...(a.inputFile ? { inputFile: a.inputFile } : {}) });
          if (name === "dispatch_visual_generation" && !spec.chatFile && !spec.generatedAssetUrl && !spec.resumeJobId) throw Error("NATIVE_GENERATED_FILE_REQUIRED: supply official fileParams or open_visual_file_upload; external API generation is prohibited");
          if (name === "dispatch_visual_generation" && spec.productionMethod === "REAL_SOURCE_AI_EDIT" && !spec.resumeJobId && !spec.inputFile) throw Error("NATIVE_EDIT_INPUT_FILE_REQUIRED");
          validateSpecTransform(spec.transform);
          if (spec.productionMethod === "REAL_SOURCE_AI_EDIT") {
            const usage = await sourceUsage(
              current.claim.pipelineImageId,
              spec.inputAssetUrl,
            );
            if (usage.result === "DUPLICATE") {
              throw Error("DUPLICATE_SOURCE_PREFLIGHT");
            }
          }
          // Verify Contract permission even when merely opening the upload UI.
          const allowed = await rpc("content_pipeline_reference_generation_allowed_v1", { p_contract: current.claim.generationContract, p_method: spec.productionMethod });
          if (allowed !== true) throw Error("REFERENCE_GENERATION_CONTRACT_NOT_ALLOWED");
          if (name === "open_visual_file_upload") {
            if (spec.generatedAssetUrl || spec.resumeJobId) throw Error("UPLOAD_REQUIRES_NEW_NATIVE_FILE");
            result = { requestId: a.requestId, operationId: a.operationId, spec, pipelineImageId: current.claim.pipelineImageId,
              contractHash: current.claim.generationContractHash, requiresInputFile: spec.productionMethod === "REAL_SOURCE_AI_EDIT", nextAction: "SELECT_OR_UPLOAD_NATIVE_CHAT_IMAGE" };
          } else {
            result = await rpc("content_pipeline_dispatch_visual_generation_request_v1", {
              p_worker_key: worker, p_request_id: a.requestId, p_operation_id: a.operationId, p_spec: spec,
            });
          }
        } else if (name === "dispatch_visual_source") {
          if (!current.activeClaim) throw inactiveClaimError(current);
          if (!uuid(a.operationId)) throw Error("INVALID_OPERATION_ID");
          if (!a.spec) throw Error("INVALID_SOURCE_SPEC");
          validateSpec(a.spec);
          for (const candidate of ((a.spec.composition as { sources: Array<{ sourceAssetUrl: string; expectedSourceSha?: string }> } | undefined)?.sources ?? [{ sourceAssetUrl: String(a.spec.sourceAssetUrl), expectedSourceSha: undefined }])) {
          const usage = await sourceUsage(current.claim.pipelineImageId, candidate.sourceAssetUrl, candidate.expectedSourceSha);
          if (usage.result === "DUPLICATE") {
            throw Error(
              "DUPLICATE_SOURCE_PREFLIGHT: select a different source within the same claim; no candidate dispatched",
            );
          }
          }
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
            if (result?.status === "STAGED" && result.result) {
              result.inspectionAccess = await inspectionAccess(result.result, current.claim);
            }
          } else if (name === "inspect_visual_source") {
            if (job.status !== "STAGED" || !job.result) {
              const status = await rpc(
                "content_pipeline_source_stage_status_v1",
                { p_job_id: a.jobId },
              );
              throw Error(
                `SOURCE_INSPECTION_NOT_READY: status=${
                  status?.status ?? "UNKNOWN"
                }; failureCode=${status?.failureCode ?? "NONE"}; nextAction=${
                  status?.nextAction ?? "POLL_SAME_JOB"
                }; inspect only after STAGED`,
              );
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
            let canonicalBlob = blob;
            let readbackTransport = "STORAGE_INTERNAL";
            if (readError || !canonicalBlob) {
              // Download only the server-generated URL for this validated private path.
              const access = await inspectionAccess(r, current.claim);
              try {
                if (!access?.available) throw Error("INSPECTION_SIGNED_URL_UNAVAILABLE");
                const signed = new URL(access.canonicalDownloadUrl);
                if (signed.origin !== new URL(url).origin) throw Error("INSPECTION_URL_ORIGIN_MISMATCH");
                const res = await fetch(signed, { redirect: "error", signal: AbortSignal.timeout(15000) });
                if (!res.ok || !res.body) throw Error("INSPECTION_SIGNED_DOWNLOAD_FAILED");
                const reader = res.body.getReader();
                const parts: Uint8Array[] = []; let count = 0;
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    count += value.length;
                    if (count > r.bytes || count > 4194304) throw Error("STAGING_IDENTITY_MISMATCH");
                    parts.push(value);
                  }
                } finally { await reader.cancel(); }
                canonicalBlob = new Blob(parts, { type: res.headers.get("content-type")?.split(";")[0] ?? "" });
                readbackTransport = "SIGNED_CANONICAL_URL";
              } catch {
                // Bounded last attempt; never change source, contract, or staged identity.
                const retry = await sb.storage.from("content-pipeline-staging").download(r.path);
                if (retry.error || !retry.data) throw Error("STAGING_READBACK_FAILED");
                canonicalBlob = retry.data;
                readbackTransport = "STORAGE_INTERNAL_RETRY";
              }
            }
            if (canonicalBlob.size !== r.bytes || canonicalBlob.type !== "image/webp") {
              throw Error("STAGING_IDENTITY_MISMATCH");
            }
            const bytes = new Uint8Array(await canonicalBlob.arrayBuffer());
            const { inspectPixels } = await import("./inspection.ts");
            const proof = await inspectPixels(bytes, r);
            result = {
              jobId: a.jobId,
              sourceSha256: r.preStagingSourceSha256 ?? r.provenance?.sourceSha256 ?? null,
              ...proof.metadata,
              technicalVerification: "PASS",
              technicalQa: "PASS",
              pixelDeliveryQa: "PASS",
              pixelDeliveryScope: "SERVER_MCP_RESPONSE",
              readbackTransport,
              clientPixelDelivery: "UNVERIFIED_REQUIRES_RENDERING",
              mobileQa: "NOT_EVALUATED",
              semanticQa: "NOT_EVALUATED",
              preflightOnly: job.result.preflightOnly === true,
              preStagingNextAction: job.result.preflightOnly ? "VIEW_PIXELS_THEN_RECORD_VISUAL_SOURCE_QA_OR_REJECT_VISUAL_SOURCE" : "FINAL_PIXEL_QA",
              mobilePreview: "DERIVED_390PX_NOT_CANONICAL",
              canonicalPath: r.path,
              inspectionAccess: await inspectionAccess(r, current.claim),
              canonicalImage: { contentIndex: 1, mimeType: "image/png", width: r.width, height: r.height, derivedFromSha256: r.sha256, transform: "LOSSLESS_DECODE_NO_RESIZE" },
              mobile390Image: { contentIndex: 2, mimeType: "image/png", width: 390, height: Math.max(1, Math.round(r.height * 390 / r.width)), derivedFromSha256: r.sha256 },
              nextAction: "VIEW_BOTH_IMAGE_CONTENT_BLOCKS_THEN_PERFORM_SEMANTIC_AND_MOBILE_QA",
              clientRenderingInstruction: "Forward each MCP image block to the model (functions.exec: image(block)). Metadata/decode PASS is not semantic QA. If pixels remain unavailable, preserve this job/SHA and resume inspection; do not regenerate.",
            };
            if (!proof.canonical?.length || !proof.mobile?.length) {
              result.pixelDeliveryQa = "FAIL";
              result.technicalVerification = "FAIL";
              result.semanticQa = "BLOCKED";
              result.mobileQa = "BLOCKED";
              result.failureCode = "INSPECTION_IMAGE_BLOCK_MISSING";
              result.nextAction = "RECOVER_SAME_JOB_PIXELS_USING_INSPECTION_ACCESS";
              return inspectionError(id, result);
            }
            images = [{
              type: "image",
              data: encodeBase64(proof.canonical),
              mimeType: "image/png",
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
                throw Error(
                  "QA_CONTRACT_HASH_MISMATCH: use current claim generationContractHash",
                );
              }
              const role = String(
                current.claim.generationContract?.asset_role ?? "BODY",
              ).toUpperCase();
              const requiredQa = ["imageQa", "mobileQa", "imageSeoQa"];
              if (["THUMBNAIL", "HERO", "THUMBNAIL_HERO"].includes(role)) {
                requiredQa.push("representativeImageQa");
              }
              if (["THUMBNAIL", "THUMBNAIL_HERO"].includes(role)) {
                requiredQa.push("cardCropQa");
              }
              if (["HERO", "THUMBNAIL_HERO"].includes(role)) {
                requiredQa.push("heroCropQa");
              }
              const missingQa = requiredQa.filter((k) => qa[k] !== "PASS");
              if (missingQa.length) {
                throw Error(
                  `EXPLICIT_QA_PASS_REQUIRED: assetRole=${role}; missingOrNonPass=${
                    missingQa.join(",")
                  }; use exact flat qa fields after actual inspection`,
                );
              }
              await rpc("content_pipeline_approve_visual_request_v1", {
                p_job_id: a.jobId,
                p_worker_key: worker, p_request_id: a.requestId,
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
            await rpc("content_pipeline_fail_visual_request_v1", {
              p_worker_key: worker, p_request_id: a.requestId,
              p_status: a.status, p_stage: a.stage, p_code: a.code, p_error: a.error,
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
    const content = [{ type: "text", text: JSON.stringify(result) }, ...images];
    if (name === "inspect_visual_source") {
      const code = inspectionContentError(result, content);
      if (code) {
        return inspectionError(id, { ...result, technicalVerification: "FAIL", pixelDeliveryQa: "FAIL",
          semanticQa: "BLOCKED", mobileQa: "BLOCKED", failureCode: code,
          nextAction: "RECOVER_SAME_JOB_PIXELS_USING_INSPECTION_ACCESS" });
      }
    }
    return json({ jsonrpc: "2.0", id, result: { content, structuredContent: result } });
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
        "composition",
        "preflightOnly",
        "preStagingQa",
        "transform",
      ].includes(k)
    )
  ) throw Error("INVALID_SOURCE_SPEC");
  if (s.composition !== undefined) {
    const c = s.composition as { layout: string; sources: Array<Record<string, unknown>> };
    if (!c || c.layout !== "SIDE_BY_SIDE" || Object.keys(c).some(k=>!["layout","sources"].includes(k)) || !Array.isArray(c.sources) || c.sources.length < 2 || c.sources.length > 3) throw Error("INVALID_SOURCE_COMPOSITION");
    if (s.sourcePdfPage !== undefined) throw Error("COMPOSITION_RASTER_REQUIRED");
    const seen = new Set();
    for (const p of c.sources) {
      if (!p || Object.keys(p).some(k=>!["sourceAssetUrl","sourcePageUrl","sourceOwner","verifiedFacts","pixelsInspected","checkedAt","expectedSourceSha","crop","label"].includes(k))) throw Error("INVALID_COMPOSITION_SOURCE");
      validateSpec({sourceAssetUrl:p.sourceAssetUrl,sourcePageUrl:p.sourcePageUrl,sourceOwner:p.sourceOwner,transform:p.crop?{crop:p.crop}:{}});
      if (seen.has(p.sourceAssetUrl)) throw Error("COMPOSITION_DUPLICATE_SOURCE"); seen.add(p.sourceAssetUrl);
      if (p.pixelsInspected !== true || !Array.isArray(p.verifiedFacts) || !p.verifiedFacts.length || p.verifiedFacts.length>8 || p.verifiedFacts.some(f=>typeof f!=="string" || !f.trim() || f.length>500) || typeof p.checkedAt!=="string" || !Number.isFinite(Date.parse(p.checkedAt))) throw Error("COMPOSITION_VERIFICATION_REQUIRED");
      if (p.expectedSourceSha !== undefined && (typeof p.expectedSourceSha!=="string" || !/^[a-f0-9]{64}$/.test(p.expectedSourceSha))) throw Error("INVALID_SOURCE_SHA");
      if (p.label !== undefined && (typeof p.label!=="string" || !/^[A-Za-z0-9 &()+.,/-]{1,24}$/.test(p.label))) throw Error("COMPOSITION_LABEL_UNSUPPORTED");
    }
    const first=c.sources[0];
    if (first.sourceAssetUrl!==s.sourceAssetUrl || first.sourcePageUrl!==s.sourcePageUrl || first.sourceOwner!==s.sourceOwner) throw Error("COMPOSITION_PRIMARY_SOURCE_MISMATCH");
    const t=s.transform as Record<string,unknown>;
    if (t?.crop || (Array.isArray(t?.annotations) && t.annotations.length)) throw Error("COMPOSITION_FINAL_TRANSFORM_NOT_ALLOWED");
    if (t?.maxWidth !== undefined && Number(t.maxWidth)<780) throw Error("COMPOSITION_WIDTH_INVALID");
  }
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
        text: string;
        fontSize?: number;
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
      } else if (a.type === "label") {
        if (!unit(a.x) || !unit(a.y) || typeof a.text !== "string" ||
            !/^[\x20-\x7e\u3131-\u318e\uac00-\ud7a3]{1,16}$/.test(a.text.normalize("NFC")) || !a.text.trim() ||
            (a.fontSize !== undefined && (!Number.isInteger(a.fontSize) || a.fontSize < 14 || a.fontSize > 24)) ||
            Object.keys(a).some(k => !["type", "text", "x", "y", "fontSize"].includes(k))) throw Error("INVALID_LABEL");
      } else throw Error("UNSUPPORTED_ANNOTATION");
    }
  }
}

// A transient signed URL is a transport fallback, never a persistent asset identity.
async function inspectionAccess(r: Record<string, unknown>, claim: { pipelineId: number; pipelineImageId: number }) {
  const sha = r.sha256;
  if (typeof sha !== "string" || !/^[a-f0-9]{64}$/.test(sha) ||
      r.bucket !== "content-pipeline-staging" ||
      r.path !== `${claim.pipelineId}/${claim.pipelineImageId}/${sha}.webp`) {
    throw Error("STAGING_METADATA_INVALID");
  }
  const { data, error } = await sb.storage.from("content-pipeline-staging").createSignedUrl(String(r.path), 600);
  if (error || !data?.signedUrl) {
    return { available: false, failureCode: "INSPECTION_SIGNED_URL_FAILED",
      canonicalPath: r.path, expectedSha: sha, nextAction: "RETRY_SAME_JOB_INSPECTION" };
  }
  return { available: true, canonicalDownloadUrl: data.signedUrl, expiresInSeconds: 600,
    canonicalPath: r.path, expectedSha: sha, expectedBytes: r.bytes,
    width: r.width, height: r.height, mobileWidth: 390,
      fallbackOrder: ["MCP_IMAGE_CONTENT", "SIGNED_CANONICAL_URL_VERIFY_SHA", "REINVOKE_SAME_JOB_STORAGE_READBACK"],
      assetPolicy: "PRESERVE_JOB_SHA_NO_REGENERATION",
    nextAction: "DOWNLOAD_VERIFY_SHA_VIEW_PIXELS_AND_DERIVE_390PX", semanticQa: "NOT_EVALUATED" };
}
function inactiveClaimError(current: Record<string, unknown>) {
  return Error(`ACTIVE_VISUAL_CLAIM_REQUIRED: result=${current.result ?? "UNKNOWN"}; status=${current.status ?? "UNKNOWN"}; failureStage=${current.failureStage ?? "NONE"}; failureCode=${current.failureCode ?? "NONE"}; nextAction=REPLAY_OWN_REQUEST_OR_WAIT_FOR_OWNER`);
}


function inspectionContentError(metadata: any, content: any[]): string | null {
  for (const key of ["canonicalImage", "mobile390Image"]) {
    const declared = metadata?.[key];
    const block = declared && content[declared.contentIndex];
    if (!declared || !Number.isInteger(declared.contentIndex) ||
        declared.contentIndex !== (key === "canonicalImage" ? 1 : 2) ||
        block?.type !== "image" || block.mimeType !== "image/png" ||
        typeof block.data !== "string" || block.data.length < 32 ||
        !block.data.startsWith("iVBORw0KGgo") ||
        declared.derivedFromSha256 !== metadata.sha256) {
      return "INSPECTION_IMAGE_BLOCK_MISSING";
    }
  }
  return null;
}
function inspectionError(id: unknown, metadata: any) {
  return json({ jsonrpc: "2.0", id, result: { isError: true,
    structuredContent: metadata, content: [{ type: "text", text: JSON.stringify(metadata) }] } });
}
