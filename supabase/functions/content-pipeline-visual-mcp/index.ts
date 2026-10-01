
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const url=Deno.env.get("SUPABASE_URL")!;
const endpoint=url+"/functions/v1/content-pipeline-visual-mcp";
const sb=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const tools=[
 {name:"get_visual_queue_status",description:"Read current image production states without claiming or changing an image. Returns at most 25 images.",inputSchema:{type:"object",properties:{pipelineId:{type:"integer",minimum:1}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
 {name:"claim_visual_image",description:"Claim exactly one 3-A image. Generate one requestId per execution intent and reuse it after an interrupted response. A new request resumes this operator's existing active 3-A claim instead of claiming another image. Does not produce, upload or complete an image.",inputSchema:{type:"object",properties:{requestId:{type:"string",format:"uuid"},pipelineImageId:{type:"integer",minimum:1}},required:["requestId"],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}},
 {name:"get_visual_claim_result",description:"Read the result of this operator's requestId after a response is lost. Does not create or renew a claim. Closed/expired requests cannot authorize writes.",inputSchema:{type:"object",properties:{requestId:{type:"string",format:"uuid"}},required:["requestId"],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false}},
 {name:"fail_visual_image",description:"Close only this operator's active 3-A image claim as RETRY or HOLD while preserving staged assets. Never completes or publishes an image.",inputSchema:{type:"object",properties:{requestId:{type:"string",format:"uuid"},status:{type:"string",enum:["RETRY","HOLD"]},stage:{type:"string",maxLength:100},code:{type:"string",maxLength:100},error:{type:"string",maxLength:2000}},required:["requestId","status","stage","code","error"],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false}}
];
function json(b:unknown,s=200,h:Record<string,string>={}){return new Response(JSON.stringify(b),{status:s,headers:{"content-type":"application/json","cache-control":"no-store",...h}});}
async function rpc(name:string,args:Record<string,unknown>){const {data,error}=await sb.rpc(name,args);if(error)throw Error(error.message);return data;}
Deno.serve(async req=>{
 const path=new URL(req.url).pathname;
 if(req.method==="GET"&&path.endsWith("/oauth-protected-resource"))return json({resource:endpoint,authorization_servers:[url+"/auth/v1"],bearer_methods_supported:["header"]});
 const challenge={"www-authenticate":'Bearer resource_metadata="'+endpoint+'/oauth-protected-resource"'};
 const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
 if(!token)return json({error:"AUTHENTICATION_REQUIRED"},401,challenge);
 const {data,error}=await sb.auth.getUser(token);
 if(error||!data.user)return json({error:"INVALID_ACCESS_TOKEN"},401,challenge);
 // Verified email and server-controlled allowlist; never user_metadata authorization.
 const allowed=(Deno.env.get("CONTENT_FACTORY_MCP_OPERATOR_EMAILS")??"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
 if(!allowed.length)return json({error:"OPERATOR_CONFIGURATION_REQUIRED"},503);
 if(!data.user.email_confirmed_at||!allowed.includes((data.user.email??"").toLowerCase()))return json({error:"OPERATOR_ACCESS_DENIED"},403);
 if(req.method!=="POST")return json({error:"METHOD_NOT_ALLOWED"},405);
 if(Number(req.headers.get("content-length")??0)>16384)return json({error:"REQUEST_TOO_LARGE"},413);
 let b:Record<string,any>;
 try{const raw=await req.text();if(new TextEncoder().encode(raw).length>16384)return json({error:"REQUEST_TOO_LARGE"},413);b=JSON.parse(raw);}catch{return json({error:"INVALID_JSON"},400);}
 const id=b.id??null;
 if(b.jsonrpc!=="2.0")return json({jsonrpc:"2.0",id,error:{code:-32600,message:"Invalid JSON-RPC"}},400);
 if(b.method==="notifications/initialized")return new Response(null,{status:202});
 if(b.method==="initialize")return json({jsonrpc:"2.0",id,result:{protocolVersion:["2024-11-05","2025-03-26","2025-06-18"].includes(b.params?.protocolVersion)?b.params.protocolVersion:"2025-06-18",capabilities:{tools:{}},serverInfo:{name:"fitbike-visual-operations",version:"1.0.0"}}});
 if(b.method==="ping")return json({jsonrpc:"2.0",id,result:{}});
 if(b.method==="tools/list")return json({jsonrpc:"2.0",id,result:{tools}});
 if(b.method!=="tools/call")return json({jsonrpc:"2.0",id,error:{code:-32601,message:"Method not found"}});
 const name=b.params?.name,a=b.params?.arguments??{},def=tools.find(t=>t.name===name);
 if(!def||typeof a!=="object"||Array.isArray(a)||a===null)return json({jsonrpc:"2.0",id,error:{code:-32602,message:"Invalid tool arguments"}});
 const keys=Object.keys(def.inputSchema.properties);
 if(Object.keys(a).some(k=>!keys.includes(k))||(def.inputSchema.required??[]).some(k=>!(k in a)))return json({jsonrpc:"2.0",id,error:{code:-32602,message:"Unexpected or missing argument"}});
 const worker="mcp-3a-"+data.user.id;
 try{
  let result;
  if(name==="get_visual_queue_status"){
   if(a.pipelineId!==undefined&&(!Number.isSafeInteger(a.pipelineId)||a.pipelineId<1))throw Error("INVALID_PIPELINE_ID");
   let q=sb.from("21_content_pipeline_image").select("pipeline_image_id,pipeline_id,image_id,asset_key,status,handoff_phase,claim_expires_at,next_eligible_at,failure_stage,failure_code").in("status",["PENDING","RETRY","PROCESSING","READY_FOR_UPLOAD"]).order("pipeline_id").order("ordinal").limit(25);
   if(a.pipelineId!==undefined)q=q.eq("pipeline_id",a.pipelineId);
   const {data,error}=await q;if(error)throw Error(error.message);result={images:data,limit:25};
  }else{
   if(!uuid(a.requestId))throw Error("INVALID_REQUEST_ID");
   if(name==="claim_visual_image"){
    if(a.pipelineImageId!==undefined&&(!Number.isSafeInteger(a.pipelineImageId)||a.pipelineImageId<1))throw Error("INVALID_IMAGE_ID");
    result=await rpc("content_pipeline_claim_visual_request_v1",{p_worker_key:worker,p_request_id:a.requestId,p_pipeline_image_id:a.pipelineImageId??null});
   }else{
    const current=await rpc("content_pipeline_visual_claim_request_status_v1",{p_worker_key:worker,p_request_id:a.requestId});
    if(name==="get_visual_claim_result")result=current;
    else{
     if(!["RETRY","HOLD"].includes(a.status)||!["stage","code","error"].every(k=>typeof a[k]==="string"&&a[k].length>0&&a[k].length<=(k==="error"?2000:100)))throw Error("INVALID_FAILURE");
     if(!current.activeClaim)result=current;
     else result=await rpc("content_pipeline_fail_image_v1",{p_pipeline_image_id:current.claim.pipelineImageId,p_pipeline_image_run_id:current.claim.pipelineImageRunId,p_claim_token:current.claim.claimToken,p_failure_status:a.status,p_failure_stage:a.stage,p_failure_code:a.code,p_error:a.error,p_retry_action:"RESUME_LAST_SUCCESSFUL_STAGE",p_metadata:{transport:"VISUAL_MCP",requestId:a.requestId}});
    }
   }
  }
  return json({jsonrpc:"2.0",id,result:{content:[{type:"text",text:JSON.stringify(result)}],structuredContent:result}});
 }catch(e){return json({jsonrpc:"2.0",id,result:{isError:true,content:[{type:"text",text:e instanceof Error?e.message:"VISUAL_OPERATION_FAILED"}]}});}
});
