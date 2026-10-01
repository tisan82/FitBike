import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const BUCKET = "content-pipeline-staging";
const sha = async (b: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b)), x => x.toString(16).padStart(2,"0")).join("");
Deno.serve(async req => {
 if (req.method !== "POST") return out({error:"METHOD_NOT_ALLOWED"},405);
 const requestDeadline = Date.now()+115000;
 const boundedFetch: typeof fetch = (input, init) => fetch(input, {...init, signal: AbortSignal.any([AbortSignal.timeout(Math.max(1000,Math.min(15000,requestDeadline-Date.now()))), ...(init?.signal ? [init.signal] : [])])});
 const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {auth:{persistSession:false},global:{fetch:boundedFetch}});
 let runId = "", authorized = false;
 try {
  const body = await req.json(); runId = String(body.runId ?? "");
  if (!/^[a-f0-9-]{36}$/.test(runId)) return out({error:"INVALID_RUN_ID"},422);
  const ticket = await sb.rpc("content_pipeline_consume_maintenance_ticket_v1",{p_run_id:runId,p_ticket:req.headers.get("x-fitbike-maintenance-ticket") ?? ""});
  if (ticket.error || !ticket.data) return out({error:"INVALID_MAINTENANCE_TICKET"},401);
  authorized = true;
  const before = await sb.rpc("content_pipeline_storage_usage_v1"); if(before.error) throw Error("USAGE_READ_FAILED");
  const planned = await sb.rpc("content_pipeline_staging_cleanup_plan_v1",{p_limit:100}); if(planned.error) throw Error("CLEANUP_PLAN_FAILED");
  const deleted:string[] = [], failures:Array<{path:string;code:string}> = [], skipped:string[] = [];
  const deadline = Date.now()+85000;
  for(const asset of planned.data ?? []) {
   if(Date.now()>deadline){skipped.push(asset.path);continue;}
   if(ticket.data.dryRun) continue;
   try {
    if(asset.reason === "VERIFIED_DONE") {
     if(!/^[a-f0-9]{64}$/.test(asset.expectedSha ?? "")) throw Error("INVALID_EXPECTED_SHA");
     for(const [bucket,path] of [["content-assets",asset.productionPath],[BUCKET,asset.path]]) {
      const read = await sb.storage.from(bucket).download(path);
      if(read.error || !read.data || read.data.size>4194304) throw Error("IDENTITY_READ_FAILED");
      const bytes = new Uint8Array(await read.data.arrayBuffer());
      if(bytes.length !== Number(asset.expectedBytes) || await sha(bytes)!==asset.expectedSha) throw Error("CLEANUP_IDENTITY_MISMATCH");
     }
    }
    // Atomic reservation coordinates with image activation/approval/rework.
    const live = await sb.rpc("content_pipeline_reserve_staging_cleanup_v1",{p_run_id:runId,p_path:asset.path});
    if(live.error) throw Error("LIVE_RESERVATION_FAILED");
    const current = live.data;
    if(!current || current.reason!==asset.reason || current.expectedSha!==asset.expectedSha || current.productionPath!==asset.productionPath){skipped.push(asset.path);continue;}
    const removed = await sb.storage.from(BUCKET).remove([asset.path]); if(removed.error) throw Error("STORAGE_DELETE_FAILED");
    // Verify actual Storage metadata absence, not merely eligibility disappearance.
    const check = await sb.storage.from(BUCKET).list(asset.path.slice(0,asset.path.lastIndexOf('/')),{search:asset.path.slice(asset.path.lastIndexOf('/')+1),limit:10});
    if(check.error || check.data?.some(x=>x.name===asset.path.slice(asset.path.lastIndexOf('/')+1))) throw Error("DELETE_VERIFY_FAILED");
    deleted.push(asset.path);
   }catch(e){failures.push({path:asset.path,code:e instanceof Error?e.message:"CLEANUP_FAILED"});}
  }
  const chunks = ticket.data.dryRun ? {data:0,error:null} : await sb.rpc("content_pipeline_cleanup_inspection_chunks_v1",{p_run_id:runId});
  if(chunks.error) failures.push({path:"inspection-chunks",code:"CHUNK_CLEANUP_FAILED"});
  const after = await sb.rpc("content_pipeline_storage_usage_v1"); if(after.error) throw Error("USAGE_READ_FAILED");
  const summary = {dryRun:ticket.data.dryRun,retentionHours:24,before:before.data,after:after.data,eligibleCount:(planned.data ?? []).length,deleted,skipped,failures,deletedInspectionChunks:chunks.data ?? 0};
  const status = failures.length || skipped.length ? "PARTIAL":"PASS";
  const saved = await sb.rpc("content_pipeline_finish_staging_maintenance_v1",{p_run_id:runId,p_summary:summary,p_status:status}); if(saved.error || saved.data?.status!==status) throw Error("MAINTENANCE_RECEIPT_FAILED");
  return out({runId,status,summary},200);
 }catch(e){
  const error=e instanceof Error?e.message:"MAINTENANCE_FAILED";
  if(authorized) await sb.rpc("content_pipeline_finish_staging_maintenance_v1",{p_run_id:runId,p_summary:{error},p_status:"FAILED"});
  return out({error},500);
 }
});
function out(b:unknown,s:number){return new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});}
