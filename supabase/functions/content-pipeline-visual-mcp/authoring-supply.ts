// Source acquisition is separate from Production claims and final pixel QA.
// The authenticated MCP boundary derives worker; callers cannot submit Storage proof.
import { downloadSource, sourceUrl, verifySourceSignature } from "../content-pipeline-source-stage/source.ts";
async function probeSource(bytes: Uint8Array) { const { probeRaster } = await import("./inspection.ts"); return probeRaster(bytes); }

const uuidSchema = { type: "string", format: "uuid" };
const idSchema = { type: "integer", minimum: 1 };
const urlSchema = { type: "string", format: "uri", maxLength: 4096 };
// This is the existing Authoring V1 envelope, not a new content format.
const textSchema = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });
const briefSchema = { type: "object", additionalProperties: false, required: ["contract_version","image_id","asset_role","user_question","visual_objective","must_show","must_not_show","evidence_requirement","alt_text_draft"], properties: {
  contract_version: {type:"integer",const:5}, image_id: {...textSchema(100),pattern:"^IMG_[0-9]{2,}$"},
  asset_role: {type:"string",enum:["THUMBNAIL","HERO","THUMBNAIL_HERO","BODY"]},
  user_question:textSchema(500),visual_objective:textSchema(1000),alt_text_draft:textSchema(300),
  must_show:{type:"array",minItems:1,maxItems:8,uniqueItems:true,items:textSchema(500)},
  must_not_show:{type:"array",maxItems:12,uniqueItems:true,items:textSchema(500)},
  evidence_requirement:{type:"object",additionalProperties:false,required:["level"],properties:{
    level:{type:"string",enum:["NONE","REFERENCE","REQUIRED"]},
    fact_ids:{type:"array",maxItems:20,uniqueItems:true,items:{type:"string",pattern:"^CF[1-9][0-9]*$"}},
    evidence_ref:{type:"array",maxItems:4,items:{type:"object",additionalProperties:false,required:["source_ref"],properties:{source_ref:{...textSchema(2000),pattern:"^https://[^\\s]+$"},model_scope:textSchema(500),supports:textSchema(1000)}}},
  }},
}};
export const authoringPackageSchema = {type:"object",additionalProperties:false,required:["version","execution","planning","research","writer"],properties:{
  version:{type:"integer",const:1},
  execution:{type:"object",additionalProperties:false,required:["pipelineId","pipelineRunId","topicKey"],properties:{pipelineId:idSchema,pipelineRunId:idSchema,topicKey:{type:"string",minLength:1}}},
  planning:{type:"object",minProperties:1,additionalProperties:true},
  research:{type:"object",minProperties:1,additionalProperties:true},
  writer:{type:"object",required:["image_briefs"],additionalProperties:true,properties:{
    authoringContext:{not:{}},image_briefs:{type:"array",minItems:1,items:briefSchema},
  }},
}};
type Schema = {type?:string;required?:string[];properties?:Record<string,Schema>;additionalProperties?:boolean;not?:object;const?:unknown;enum?:unknown[];minimum?:number;minLength?:number;maxLength?:number;pattern?:string;minProperties?:number;minItems?:number;maxItems?:number;uniqueItems?:boolean;items?:Schema};
export class AuthoringInputError extends Error {
  code="AUTHORING_PACKAGE_INVALID";
  constructor(public field:string,public reason:string){super("AUTHORING_PACKAGE_INVALID");}
}
function checkSchema(value:unknown,schema:Schema,path:string):void {
  const fail=(reason:string):never=>{throw new AuthoringInputError(path,reason);};
  if(schema.not)fail("SERVER_MANAGED_FIELD");
  if(schema.type==="object"){
    if(!value||typeof value!=="object"||Array.isArray(value))fail("OBJECT_REQUIRED");
    const obj=value as Record<string,unknown>;
    for(const key of schema.required??[])if(!(key in obj))throw new AuthoringInputError(path+"."+key,"REQUIRED");
    if(schema.minProperties&&Object.keys(obj).length<schema.minProperties)fail("NONEMPTY_OBJECT_REQUIRED");
    for(const key of Object.keys(obj)){
      if(schema.properties?.[key])checkSchema(obj[key],schema.properties[key],path+"."+key);
      else if(schema.additionalProperties===false)throw new AuthoringInputError(path+"."+key,"UNEXPECTED_FIELD");
    }
  }else if(schema.type==="array"){
    if(!Array.isArray(value))fail("ARRAY_REQUIRED");
    const items=value as unknown[];
    if((schema.minItems!==undefined&&items.length<schema.minItems)||(schema.maxItems!==undefined&&items.length>schema.maxItems))fail("INVALID_ITEM_COUNT");
    if(schema.uniqueItems&&new Set(items.map(x=>JSON.stringify(x))).size!==items.length)fail("DUPLICATE_ITEM");
    items.forEach((item,i)=>checkSchema(item,schema.items??{},path+"["+i+"]"));
  }else if(schema.type==="string"){
    if(typeof value!=="string")fail("STRING_REQUIRED");
    const text=value as string;
    if(!text.trim()||(schema.maxLength!==undefined&&[...text].length>schema.maxLength))fail("INVALID_TEXT_LENGTH");
    if(schema.pattern&&!new RegExp(schema.pattern).test(text))fail("INVALID_FORMAT");
  }else if(schema.type==="integer"){
    if(!Number.isSafeInteger(value)||(schema.minimum!==undefined&&(value as number)<schema.minimum))fail("INTEGER_REQUIRED");
  }
  if("const" in schema&&value!==schema.const)fail("INVALID_CONSTANT");
  if(schema.enum&&!schema.enum.includes(value))fail("INVALID_ENUM");
}
export function validateAuthoringPackage(a:Record<string,unknown>){
  checkSchema(a.pipelineId,idSchema,"pipelineId");checkSchema(a.pipelineRunId,idSchema,"pipelineRunId");
  checkSchema(a.package,authoringPackageSchema,"package");
  const pack=a.package as {execution:{pipelineId:number;pipelineRunId:number};writer:{image_briefs:Array<{must_show:string[];must_not_show:string[]}>}};
  for(const key of ["pipelineId","pipelineRunId"] as const)if(pack.execution[key]!==a[key])throw new AuthoringInputError("package.execution."+key,"TARGET_MISMATCH");
  pack.writer.image_briefs.forEach((brief,i)=>{
    for(const key of ["must_show","must_not_show"] as const){
      const normalized=brief[key].map(x=>x.trim().toLowerCase());
      if(new Set(normalized).size!==normalized.length)throw new AuthoringInputError(`package.writer.image_briefs[${i}].${key}`,"DUPLICATE_ITEM");
    }
    if(brief.must_show.some(x=>brief.must_not_show.some(y=>x.trim().toLowerCase()===y.trim().toLowerCase())))throw new AuthoringInputError(`package.writer.image_briefs[${i}].must_not_show`,"VISIBLE_CONTRADICTION");
  });
}
export function authoringDiagnostic(error:unknown,tool:string){
  const input=error instanceof AuthoringInputError;
  const readOnly=["get_authoring_execution_status","get_authoring_source_supply","preview_authoring_source"].includes(tool);
  const code=input?error.code:error instanceof Error?error.message.match(/^(AUTHORING_[A-Z_]+|SUPPLY_[A-Z_]+|SOURCE_[A-Z_]+|CONTENT_PIPELINE_WRITER_[A-Z_]+)(?::|$)/)?.[1]:null;
  const fields:Record<string,string>={AUTHORING_PACKAGE_INVALID:"package",AUTHORING_PACKAGE_CONTEXT_INVALID:"package.execution",AUTHORING_V5_BRIEFS_REQUIRED:"package.writer.image_briefs",CONTENT_PIPELINE_WRITER_FEASIBILITY_REQUIRED:"package.writer.image_briefs",CONTENT_PIPELINE_WRITER_CONTRACT_GATE_FAILED:"package.writer.image_briefs"};
  return {tool,code:code??"AUTHORING_SERVER_OPERATION_FAILED",field:input?error.field:code?fields[code]??null:null,reason:input?error.reason:null,
    stage:input?"REQUEST_VALIDATION":"AUTHORING_OPERATION",mutationOutcome:input||readOnly?"NOT_ATTEMPTED":code?"REJECTED":"UNVERIFIED_REQUIRES_READBACK",
    nextAction:input?"FIX_FIELDS_REUSE_SAME_RUN":code==="AUTHORING_EXECUTION_BUSY"?"GET_AUTHORING_EXECUTION_STATUS_REUSE_EXISTING_RUN":"GET_AUTHORING_EXECUTION_STATUS_BEFORE_RETRY"};
}
const fileSchema = { type: "object", properties: {
  download_url: urlSchema, file_id: { type: "string", minLength: 1, maxLength: 200 },
  mime_type: { type: "string", enum: ["image/png", "image/jpeg", "image/webp"] },
  file_name: { type: "string", maxLength: 255 },
}, required: ["download_url", "file_id"], additionalProperties: false };
const observationSchema = { type: "object", properties: {
  expectedSha: { type: "string", pattern: "^[a-f0-9]{64}$" },
  pixelsInspected: { type: "boolean", const: true },
  evidence: { type: "string", minLength: 20, maxLength: 1000 },
}, required: ["expectedSha", "pixelsInspected", "evidence"], additionalProperties: false };
const define = (name: string, description: string, properties: Record<string, unknown>, required: string[], readOnly = false, constraints: Record<string,unknown> = {}) => ({
  name, description, inputSchema: { type: "object", properties, required, additionalProperties: false, ...constraints },
  annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: !readOnly },
});
export const authoringSupplyTools = [
  define("claim_content_authoring", "Claim one unified research/writing task and bind its source-supply context to this authenticated operator. Does not claim image production. Existing active authoring intents remain fenced.", { requestId: uuidSchema, pipelineId: idSchema }, ["requestId"]),
  define("get_authoring_execution_status", "Read only this operator's Authoring run by requestId or pipelineId, including activeExecution, packageExecution and nextAction. Image claim lookup does not report Authoring state. Does not claim, complete, fail or release anything.", {requestId:uuidSchema,pipelineId:idSchema}, [], true, {anyOf:[{required:["requestId"]},{required:["pipelineId"]}]}),
  define("complete_content_authoring", "Atomically save the existing unified-authoring V1 package, synchronize image Tasks, and require supplied input for these new Tasks. Returns missing Source identities; content saved is not Source complete. Continue supplying within this same chat. Exact completion replay is safe.", { pipelineId: idSchema, pipelineRunId: idSchema, package: authoringPackageSchema }, ["pipelineId", "pipelineRunId", "package"]),
  define("fail_content_authoring", "Close only this operator's exact current unified-authoring run as HOLD or BLOCKED when research/writing cannot finish. Preserves draft evidence; does not fail image production or change schedules.", {pipelineId:idSchema,pipelineRunId:idSchema,status:{type:"string",enum:["HOLD","BLOCKED"]},error:{type:"string",minLength:1,maxLength:2000}},["pipelineId","pipelineRunId","status","error"]),
  define("open_authoring_source_supply", "Open or resume Source-only supply for an existing drafted content, returning current image Tasks and Contract hashes. Does not rewrite content or acquire a Production Claim; current active image leases and approved/published assets remain protected.", { pipelineId: idSchema }, ["pipelineId"]),
  define("preview_authoring_source", "Read an actual public raster Source, verify signature/decode and SHA, and return its 390px pixel preview. Inspect the image block before supplying sourceObservation. Technical decode does not assert semantic PASS. PDF is not a raster photo Source.", { sourceAssetUrl: urlSchema }, ["sourceAssetUrl"], true),
  define("persist_authoring_source", "Preserve one already-inspected real Source in private Storage, verify original bytes by read-back, and bind it to the current drafted image/Contract. sourceObservation.expectedSha must match the actual original file SHA from preview. Optional official file input must be the same observed real Source; this tool does not generate or accept Native output as a real photo. No Production Claim, approval or final pixel QA.", {
    pipelineRunId: idSchema, pipelineImageId: idSchema, operationId: uuidSchema,
    contractHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    sourceRole: { type: "string", enum: ["PRODUCTION_INPUT", "REFERENCE_ONLY"] },
    sourceAssetUrl: urlSchema, sourcePageUrl: urlSchema, sourceOwner: { type: "string", minLength: 1, maxLength: 200 },
    nativeEditRequired: { type: "boolean", description: "True if this Source cannot meet the Contract through deterministic transform alone. Such input is not ready for scheduled Source-only production." },
    sourceObservation: observationSchema, file: fileSchema,
  }, ["pipelineRunId", "pipelineImageId", "operationId", "contractHash", "sourceRole", "sourceAssetUrl", "sourcePageUrl", "sourceOwner", "nativeEditRequired", "sourceObservation"]),
  define("get_authoring_source_supply", "Read shared Source supply and missing inputs for one content/image as an authenticated FitBike operator. Original private paths are receipts, not download authorization; no signed file URLs or operator credentials are returned. Writes remain owner-fenced.", { pipelineId: idSchema, pipelineImageId: idSchema }, ["pipelineId"] ,true),
];
(authoringSupplyTools.find(t => t.name === "persist_authoring_source") as unknown as Record<string, unknown>)._meta = { "openai/fileParams": ["file"] };
export const authoringSupplyToolNames = new Set(authoringSupplyTools.map(t => t.name));
const sha = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)), x => x.toString(16).padStart(2, "0")).join("");
export function recordableSourceUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 4096) throw Error("SOURCE_SUPPLY_URL_INVALID");
  const u = sourceUrl(value);
  if (/[?&](?:token|access_token|key|signature|sig|expires|x-amz-[^=]*|x-goog-[^=]*)=/i.test(u.search)) throw Error("SOURCE_SUPPLY_CAPABILITY_URL_FORBIDDEN");
  return u.href;
}
function validateObservation(value: unknown): asserts value is { expectedSha: string; pixelsInspected: true; evidence: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("SOURCE_OBSERVATION_REQUIRED");
  const o = value as Record<string, unknown>;
  if (Object.keys(o).some(k => !["expectedSha", "pixelsInspected", "evidence"].includes(k)) ||
    typeof o.expectedSha !== "string" || !/^[a-f0-9]{64}$/.test(o.expectedSha) || o.pixelsInspected !== true ||
    typeof o.evidence !== "string" || o.evidence.trim().length < 20 || o.evidence.length > 1000 || /https?:\/\/|data:|bearer /i.test(o.evidence)) throw Error("SOURCE_OBSERVATION_INVALID");
}
type Row = Record<string,unknown>;
type Query = {eq:(key:string,value:unknown)=>Query;order:(key:string,options:object)=>Query;limit:(n:number)=>Query;maybeSingle:()=>PromiseLike<{data:Row|null;error:unknown}>};
type Client = { from:(table:string)=>{select:(columns:string)=>Query}; storage: { from: (bucket: string) => {
  upload: (path: string, bytes: Uint8Array, options: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
  download: (path: string) => Promise<{ data: Blob | null; error: unknown }>;
} } };
type Rpc = (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
export async function executeAuthoringSupply(name: string, a: Record<string, unknown>, context: { worker: string; sb: Client; rpc: Rpc }) {
  const { worker, sb, rpc } = context;
  const wrap = (result: unknown, images: Uint8Array[] = []) => ({ result, images });
  if(name==="get_authoring_execution_status"){
    if(a.requestId===undefined&&a.pipelineId===undefined)throw new AuthoringInputError("pipelineId","PIPELINE_OR_REQUEST_REQUIRED");
    if(a.pipelineId!==undefined)checkSchema(a.pipelineId,idSchema,"pipelineId");
    if(a.requestId!==undefined&&!(typeof a.requestId==="string"&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(a.requestId)))throw new AuthoringInputError("requestId","UUID_REQUIRED");
    let query=sb.from("19_content_pipeline_run").select("pipeline_run_id,pipeline_id,stage,status,started_at,completed_at,metadata").eq("metadata->>sourceSupplyWorkerKey",worker).eq("metadata->>executionMode","AUTHORING_V1");
    if(a.pipelineId!==undefined)query=query.eq("pipeline_id",a.pipelineId);
    if(a.requestId!==undefined)query=query.eq("metadata->>authoringRequestId",a.requestId);
    const {data:run,error}=await query.order("pipeline_run_id",{ascending:false}).limit(1).maybeSingle();
    if(error)throw Error("AUTHORING_STATUS_READ_FAILED");
    if(!run)return wrap({result:"NOT_FOUND",activeExecution:false,nextAction:"CHECK_ORIGINAL_AUTHORING_IDENTIFIERS"});
    const {data:pipe,error:pipeError}=await sb.from("18_content_pipeline").select("pipeline_id,stage,topic_key").eq("pipeline_id",run.pipeline_id).maybeSingle();
    if(pipeError||!pipe)throw Error("AUTHORING_STATUS_READ_FAILED");
    if(run.status==="RUNNING"&&pipe.stage!=="WRITING")throw Error("AUTHORING_STATUS_STATE_CHANGED");
    const meta=run.metadata as Row;
    const active=run.status==="RUNNING"&&pipe.stage==="WRITING";
    return wrap({result:active?"RUNNING":run.status,activeExecution:active,pipelineId:run.pipeline_id,pipelineRunId:run.pipeline_run_id,
      requestId:meta.authoringRequestId,targetPipelineId:meta.targetPipelineId??null,stage:pipe.stage,runStatus:run.status,topicKey:pipe.topic_key,
      packageExecution:{pipelineId:run.pipeline_id,pipelineRunId:run.pipeline_run_id,topicKey:pipe.topic_key},
      contentSaved:meta.sourceSupplyCompleted===true||typeof meta.authoringPackageHash==="string",
      startedAt:run.started_at,completedAt:run.completed_at,
      nextAction:active?"FIX_PACKAGE_AND_COMPLETE_SAME_RUN":run.status==="PASS"?"GET_AUTHORING_SOURCE_SUPPLY":"READ_FAILURE_BEFORE_NEW_INTENT"});
  }
  if (name === "claim_content_authoring") return wrap(await rpc("content_pipeline_claim_authoring_supply_v1", { p_worker_key: worker, p_request_id: a.requestId, p_pipeline_id: a.pipelineId ?? null }));
  if (name === "complete_content_authoring") { validateAuthoringPackage(a); return wrap(await rpc("content_pipeline_complete_authoring_supply_v1", { p_worker_key: worker, p_pipeline_id: a.pipelineId, p_pipeline_run_id: a.pipelineRunId, p_package: a.package })); }
  if (name === "fail_content_authoring") return wrap(await rpc("content_pipeline_fail_authoring_supply_v1",{p_worker_key:worker,p_pipeline_id:a.pipelineId,p_pipeline_run_id:a.pipelineRunId,p_failure_status:a.status,p_error:a.error}));
  if (name === "open_authoring_source_supply") return wrap(await rpc("content_pipeline_open_source_supply_v1", { p_worker_key: worker, p_pipeline_id: a.pipelineId }));
  if (name === "get_authoring_source_supply") return wrap(await rpc("content_pipeline_source_supply_status_v1", { p_worker_key: worker, p_pipeline_id: a.pipelineId ?? null, p_pipeline_image_id: a.pipelineImageId ?? null }));
  if (name === "preview_authoring_source") {
    const original = await downloadSource(recordableSourceUrl(a.sourceAssetUrl));
    if (!["image/png", "image/jpeg", "image/webp"].includes(original.mime) || original.bytes.length > 8388608) throw Error("SOURCE_SUPPLY_RASTER_REQUIRED");
    for (const u of [...original.redirects, original.finalUrl]) recordableSourceUrl(u);
    const decoded = await probeSource(original.bytes);
    return wrap({ originalSha: await sha(original.bytes), sourceAssetUrl: a.sourceAssetUrl, finalSourceAssetUrl: original.finalUrl,
      width: decoded.width, height: decoded.height, byteSize: original.bytes.length, mimeType: original.mime,
      decode: "PASS", pixelsInspected: false, nextAction: "INSPECT_IMAGE_BLOCK_THEN_PERSIST_EXACT_SHA" }, [decoded.preview]);
  }
  if (name !== "persist_authoring_source") throw Error("UNKNOWN_AUTHORING_SUPPLY_TOOL");
  validateObservation(a.sourceObservation);
  if (typeof a.sourceRole !== "string" || !["PRODUCTION_INPUT", "REFERENCE_ONLY"].includes(a.sourceRole) || typeof a.nativeEditRequired !== "boolean" || typeof a.sourceOwner !== "string" || !a.sourceOwner.trim() || a.sourceOwner.length > 200) throw Error("SOURCE_SUPPLY_INPUT_INVALID");
  const intent = { contractHash: a.contractHash, sourceRole: a.sourceRole, sourceKind: "REAL_SOURCE",
    sourcePageUrl: recordableSourceUrl(a.sourcePageUrl), sourceAssetUrl: recordableSourceUrl(a.sourceAssetUrl),
    sourceOwner: a.sourceOwner.trim(), nativeEditRequired: a.nativeEditRequired, sourceObservation: a.sourceObservation };
  const receipt = await rpc("content_pipeline_prepare_source_supply_v1", { p_worker_key: worker, p_pipeline_run_id: a.pipelineRunId,
    p_pipeline_image_id: a.pipelineImageId, p_operation_id: a.operationId, p_intent: intent });
  if (receipt.status === "READY") return wrap(receipt);
  let fileUrl = intent.sourceAssetUrl;
  if (a.file !== undefined) {
    const file = a.file as Record<string, unknown>;
    if (!a.file || typeof a.file !== "object" || Array.isArray(a.file) || typeof file.file_id !== "string" || !file.file_id || typeof file.download_url !== "string" || Object.keys(file).some(k => !["download_url", "file_id", "file_name", "mime_type"].includes(k))) throw Error("SOURCE_SUPPLY_FILE_INVALID");
    fileUrl = sourceUrl(file.download_url).href;
  }
  const original = await downloadSource(fileUrl, a.file !== undefined);
  if (!["image/png", "image/jpeg", "image/webp"].includes(original.mime) || original.bytes.length < 12 || original.bytes.length > 8388608) throw Error("SOURCE_SUPPLY_RASTER_REQUIRED");
  if (a.file === undefined) for (const u of [...original.redirects, original.finalUrl]) recordableSourceUrl(u);
  verifySourceSignature(original.bytes, original.mime);
  const digest = await sha(original.bytes);
  if (digest !== a.sourceObservation.expectedSha) throw Error("SOURCE_SUPPLY_OBSERVATION_IDENTITY_MISMATCH");
  const decoded = await probeSource(original.bytes); // Decode originals without rewriting/resizing the stored bytes.
  const extension = original.mime === "image/png" ? "png" : original.mime === "image/jpeg" ? "jpg" : "webp";
  if (typeof receipt.supplyId !== "string" || !Number.isSafeInteger(receipt.pipelineId) || !Number.isSafeInteger(receipt.pipelineImageId)) throw Error("SOURCE_SUPPLY_RECEIPT_INVALID");
  const path = `authoring-supply/${receipt.pipelineId}/${receipt.pipelineImageId}/${receipt.supplyId}/${digest}.${extension}`;
  const bucket = sb.storage.from("content-pipeline-native-handoff");
  const upload = await bucket.upload(path, original.bytes, { contentType: original.mime, upsert: false });
  if (upload.error && !/already exists|Duplicate/i.test(upload.error.message)) throw Error("SOURCE_SUPPLY_UPLOAD_FAILED");
  const read = await bucket.download(path);
  if (read.error || !read.data) throw Error("SOURCE_SUPPLY_READBACK_FAILED");
  if (read.data.type.split(";")[0] !== original.mime) throw Error("SOURCE_SUPPLY_READBACK_MIME_MISMATCH");
  const bytes = new Uint8Array(await read.data.arrayBuffer());
  if (bytes.length !== original.bytes.length || await sha(bytes) !== digest) throw Error("SOURCE_SUPPLY_READBACK_IDENTITY_MISMATCH");
  verifySourceSignature(bytes, original.mime);
  const readProof = await probeSource(bytes);
  if (readProof.width !== decoded.width || readProof.height !== decoded.height) throw Error("SOURCE_SUPPLY_READBACK_DECODE_MISMATCH");
  const result = await rpc("content_pipeline_finish_source_supply_v1", { p_worker_key: worker, p_supply_id: receipt.supplyId,
    p_proof: { storageBucket: "content-pipeline-native-handoff", storagePath: path, sha256: digest, mimeType: original.mime,
      byteSize: bytes.length, width: decoded.width, height: decoded.height, decodeVerified: true, signatureVerified: true } });
  return wrap(result);
}
