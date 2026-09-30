import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// Runtime adapter, not a substitute for Chat file access. Never prints the binary.
export async function stageFinalWebP({ filePath, pipelineImageId, claimToken, qa, supabaseUrl = process.env.SUPABASE_URL, serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY }) {
  if (!supabaseUrl || !serviceRoleKey) throw new Error("CHAT_ASSET_BRIDGE_UNAVAILABLE: authorized RPC transport missing");
  const bytes = await readFile(filePath);
  if (bytes.length < 12 || bytes.length > 4194304 || bytes.subarray(0,4).toString() !== "RIFF" || bytes.subarray(8,12).toString() !== "WEBP") throw new Error("INVALID_FINAL_WEBP");
  if (qa?.imageQa !== "PASS" || qa?.mobileQa !== "PASS" || qa?.imageSeoQa !== "PASS" || !qa?.contractHash) throw new Error("VISUAL_QA_REQUIRED");
  const sb = createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc = async (name,args) => { const {data,error}=await sb.rpc(name,args); if(error) throw new Error(`${name}: ${error.message}`); return data; };
  const imageBase64 = bytes.toString("base64"), chunkSize = 60000;
  const handoffId = await rpc("content_pipeline_begin_generated_asset_handoff_v1",{p_pipeline_image_id:pipelineImageId,p_claim_token:claimToken,p_expected_sha256:createHash("sha256").update(bytes).digest("hex"),p_expected_bytes:bytes.length,p_chunk_count:Math.ceil(imageBase64.length/chunkSize)});
  for(let seq=0;seq*chunkSize<imageBase64.length;seq++) await rpc("content_pipeline_append_generated_asset_chunk_v1",{p_handoff_id:handoffId,p_seq:seq,p_chunk:imageBase64.slice(seq*chunkSize,(seq+1)*chunkSize)});
  return rpc("content_pipeline_dispatch_staging_v1",{p_pipeline_image_id:pipelineImageId,p_claim_token:claimToken,p_handoff_id:handoffId,p_qa:qa});
}
if(import.meta.url === `file://${process.argv[1]}`) {
  const [filePath,imageId,claimToken,qaFile]=process.argv.slice(2);
  if(!filePath||!imageId||!claimToken||!qaFile) throw new Error("Usage: <webp> <pipelineImageId> <claimToken> <qa.json>");
  console.log(JSON.stringify(await stageFinalWebP({filePath,pipelineImageId:Number(imageId),claimToken,qa:JSON.parse(await readFile(qaFile,"utf8"))})));
}
