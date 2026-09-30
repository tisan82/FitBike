import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ImageMagick, initializeImageMagick } from "npm:@imagemagick/magick-wasm@0.0.42";
const wasm = await Deno.readFile(new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42")));
await initializeImageMagick(wasm);
const STAGING = "content-pipeline-staging";
const PRODUCTION = "content-assets";
const MAX_BYTES = 4194304;
const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer)), b => b.toString(16).padStart(2, "0")).join("");

async function inspect(bytes: Uint8Array, expectedSha: string, mime = "image/webp") {
  if (mime !== "image/webp" || bytes.length < 12 || bytes.length > MAX_BYTES ||
      new TextDecoder().decode(bytes.slice(0,4)) !== "RIFF" || new TextDecoder().decode(bytes.slice(8,12)) !== "WEBP") throw new Error("INVALID_WEBP");
  const sha256 = await digest(bytes);
  if (sha256 !== expectedSha) throw new Error("ASSET_IDENTITY_MISMATCH");
  let width = 0, height = 0;
  ImageMagick.read(bytes, img => { width = img.width; height = img.height; });
  if (width < 1 || height < 1) throw new Error("WEBP_DECODE_FAILED");
  return { status: "PASS", sha256, bytes: bytes.length, mime, width, height, decode: "PASS", signature: "RIFF/WEBP" };
}

Deno.serve(async req => {
  if (req.method !== "POST") return out({ error: "METHOD_NOT_ALLOWED" }, 405);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let claimed: { pipeline_image_id: number; claim_token: string; pipeline_id: number } | null = null;
  let runId: number | null = null;
  let mode = "";
  try {
    const body = await req.json();
    mode = body.mode;
    if (!["stage", "publish"].includes(mode) || !Number.isSafeInteger(body.pipelineImageId) || typeof body.claimToken !== "string") throw new Error("INVALID_REQUEST");
    const { data: image, error: imageError } = await supabase.from("21_content_pipeline_image").select("pipeline_image_id,pipeline_id,asset_key,claim_token,claim_expires_at,status,generation_contract_hash,staging_asset").eq("pipeline_image_id",body.pipelineImageId).single();
    if (imageError || !image || image.status !== "PROCESSING" || image.claim_token !== body.claimToken || Date.parse(image.claim_expires_at) <= Date.now()) return out({ error: "INVALID_IMAGE_CLAIM" },409);
    const { data: pipeline } = await supabase.from("18_content_pipeline").select("content_key,ownership_state,stage").eq("pipeline_id",image.pipeline_id).single();
    if (!pipeline || pipeline.ownership_state !== "CLAIMED" || !["DRAFTED","VISUAL"].includes(pipeline.stage)) throw new Error("INVALID_PIPELINE_STATE");
    const { data: authorized, error: authError } = await supabase.rpc("content_pipeline_consume_asset_upload_ticket_v1", { p_pipeline_id: image.pipeline_id, p_content_key: pipeline.content_key, p_asset_key: image.asset_key, p_ticket: req.headers.get("x-fitbike-upload-ticket") ?? "" });
    if (authError || authorized !== true) return out({ error: "UPLOAD_TICKET_INVALID" },401);
    claimed = image;
    const { data: run } = await supabase.from("23_content_pipeline_image_run").select("pipeline_image_run_id").eq("pipeline_image_id",image.pipeline_image_id).eq("claim_token",body.claimToken).eq("status","RUNNING").single();
    runId = run?.pipeline_image_run_id ?? null;
    if (!runId) throw new Error("IMAGE_RUN_MISSING");
    if (mode === "stage") {
      if (image.staging_asset) throw new Error("STAGING_ALREADY_READY");
      if (body.qa?.contractHash !== image.generation_contract_hash || body.qa?.imageQa !== "PASS" || body.qa?.mobileQa !== "PASS" || body.qa?.imageSeoQa !== "PASS") throw new Error("VISUAL_QA_REQUIRED");
      const { data: handoff } = await supabase.from("25_content_pipeline_generated_asset_handoff").select("pipeline_image_id,claim_token,expected_sha256,expected_bytes,chunk_count,expires_at,consumed_at").eq("handoff_id",body.handoffId).single();
      if (!handoff || handoff.pipeline_image_id !== image.pipeline_image_id || handoff.claim_token !== body.claimToken || handoff.consumed_at || Date.parse(handoff.expires_at)<=Date.now()) throw new Error("INVALID_HANDOFF");
      const { data: chunks, error: chunkError } = await supabase.from("26_content_pipeline_generated_asset_chunk").select("seq,chunk").eq("handoff_id",body.handoffId).order("seq");
      if (chunkError || !chunks || chunks.length!==handoff.chunk_count || chunks.some((c,n)=>c.seq!==n)) throw new Error("INCOMPLETE_HANDOFF");
      const bytes = Uint8Array.from(atob(chunks.map(c=>c.chunk).join("")), c=>c.charCodeAt(0));
      if (bytes.length!==handoff.expected_bytes) throw new Error("HANDOFF_BYTE_MISMATCH");
      const final = await inspect(bytes,handoff.expected_sha256);
      const path = `${image.pipeline_id}/${image.pipeline_image_id}/${final.sha256}.webp`;
      const stored = await putAndRead(STAGING,path,bytes,final.sha256);
      const asset = { ...stored, bucket: STAGING, path, contractHash: image.generation_contract_hash, qa: body.qa, storageVerification: "PASS", stagedAt: new Date().toISOString() };
      const { data: result, error } = await supabase.rpc("content_pipeline_record_staging_v1",{p_pipeline_image_id:image.pipeline_image_id,p_claim_token:body.claimToken,p_asset:asset});
      if (error) throw new Error(error.message);
      // Do not consume the only recoverable binary until persistent read-back + DB commit succeeds.
      await supabase.from("25_content_pipeline_generated_asset_handoff").update({consumed_at:new Date().toISOString()}).eq("handoff_id",body.handoffId);
      await supabase.from("26_content_pipeline_generated_asset_chunk").delete().eq("handoff_id",body.handoffId);
      return out(result,200);
    }
    const a = image.staging_asset;
    const expectedPath = `${image.pipeline_id}/${image.pipeline_image_id}/${a?.sha256}.webp`;
    if (!a || a.bucket!==STAGING || a.path!==expectedPath || a.contractHash!==image.generation_contract_hash || !/^[a-f0-9]{64}$/.test(a.sha256)) throw new Error("INVALID_STAGING_METADATA");
    const { data: blob, error: readError } = await supabase.storage.from(STAGING).download(a.path);
    if (!blob || readError) throw new Error("STAGING_READ_FAILED");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const stage = await inspect(bytes,a.sha256,blob.type);
    if (stage.bytes!==a.bytes || stage.width!==a.width || stage.height!==a.height) throw new Error("STAGING_IDENTITY_MISMATCH");
    const path = `contents/${pipeline.content_key}/${image.asset_key}-${a.sha256.slice(0,12)}.webp`;
    const storageVerification = await putAndRead(PRODUCTION,path,bytes,a.sha256);
    await supabase.from("21_content_pipeline_image").update({handoff_phase:"VERIFYING"}).eq("pipeline_image_id",image.pipeline_image_id).eq("claim_token",body.claimToken);
    const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${PRODUCTION}/${path}`;
    const res = await fetch(`${publicUrl}?verify=${Date.now()}`,{cache:"no-store",signal:AbortSignal.timeout(15000)});
    if (res.status!==200) throw new Error("PUBLIC_URL_FAILED");
    const finalRenderVerification = { ...await inspect(new Uint8Array(await res.arrayBuffer()),a.sha256,(res.headers.get("content-type")??"").split(";")[0].toLowerCase()), httpStatus:200 };
    const { data: result, error: completeError } = await supabase.rpc("content_pipeline_complete_image_v1",{
      p_pipeline_image_id:image.pipeline_image_id,p_pipeline_image_run_id:runId,p_claim_token:body.claimToken,
      p_generation_status:"PASS",p_qa_status:"PASS",p_file_status:"PASS",p_upload_status:"UPLOADED",
      p_storage_bucket:PRODUCTION,p_storage_path:path,p_sha256:a.sha256,
      p_metadata:{...a.qa,sourceAssetUrl:a.qa.sourceAssetUrl ?? a.qa.provenance?.sourceAssetUrl,stage:"3-B",stagingAsset:a,storageVerification,finalRenderVerification,productionUrl:publicUrl,uploadTransport:"PERSISTENT_STAGING_PG_NET"}
    });
    if (completeError) throw new Error(completeError.message);
    const { data: done, error: doneError } = await supabase.from("21_content_pipeline_image").select("status,storage_path,sha256,image_id,asset_key").eq("pipeline_image_id",image.pipeline_image_id).single();
    if (doneError || done?.status!=="DONE" || done.sha256!==a.sha256 || done.storage_path!==path) throw new Error("DONE_READBACK_FAILED");
    return out({ ...result, productionUrl:publicUrl, storageVerification, finalRenderVerification, dbReadback:done },200);
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (claimed && runId) {
      const failed = await supabase.rpc("content_pipeline_fail_image_v1",{p_pipeline_image_id:claimed.pipeline_image_id,p_pipeline_image_run_id:runId,p_claim_token:claimed.claim_token,
        p_failure_status:"RETRY",p_failure_stage:mode==="stage"?"STAGING":"UPLOAD_VERIFY",p_failure_code:code.slice(0,150),p_error:code,
        p_retry_action:mode==="stage"?"RESUME_STAGING":"RESUME_PUBLISH",p_metadata:{stage:mode==="stage"?"3-A":"3-B",preservedAsset:true}});
      if (failed.error) return out({error:code,failureRecord:"FAILED",failureRecordError:failed.error.message},422);
    }
    return out({error:code},422);
  }

  async function putAndRead(bucket: string,path: string,bytes: Uint8Array,sha: string) {
    let downloaded = await supabase.storage.from(bucket).download(path);
    if (downloaded.error || !downloaded.data) {
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path,bytes,{contentType:"image/webp",upsert:false,cacheControl:bucket===STAGING?"0":"31536000"});
      if (uploadError) throw new Error("STORAGE_UPLOAD_FAILED");
      downloaded = await supabase.storage.from(bucket).download(path);
    }
    if (downloaded.error || !downloaded.data) throw new Error("STORAGE_READBACK_FAILED");
    return inspect(new Uint8Array(await downloaded.data.arrayBuffer()),sha,downloaded.data.type);
  }
});
function out(body: unknown,status: number) { return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}}); }
