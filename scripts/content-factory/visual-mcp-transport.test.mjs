import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
const source=readFileSync(new URL("../../supabase/functions/content-pipeline-visual-mcp/index.ts",import.meta.url),"utf8").replace(/^import .*;$/gm,"").replaceAll('await import("./generation.ts")','await loadGeneration()').replaceAll('await import("./inspection.ts")','await loadInspection()').replace('e instanceof Error?e.message:"VISUAL_OPERATION_FAILED"','String(e.message ?? e)');
const REQUEST="11111111-1111-4111-8111-111111111111",JOB="22222222-2222-4222-8222-222222222222";
function harness({email="operator@example.org",confirmed=true,configured=true,active=true,jobImage=2000,role="BODY",duplicate=false,recovery=null,signedError=false,staged=false,claimResult}={}){
 let handler;const calls=[];
 const current={result:claimResult??(active?"CLAIMED":"CLOSED"),failureCode:"MUST_SHOW_MISMATCH",activeClaim:active,status:active?"PROCESSING":"RETRY",claim:{pipelineImageId:2000,pipelineId:21,pipelineImageRunId:3,claimToken:REQUEST,generationContractHash:"contract",generationContract:{asset_role:role}}};
 const stagedResult={sha256:"a".repeat(64),bucket:"content-pipeline-staging",path:"21/2000/"+"a".repeat(64)+".webp",bytes:12,width:1200,height:675};
 const sb={storage:{from:()=>({download:async()=>({data:new Blob([new Uint8Array(12)],{type:"image/webp"}),error:null}),createSignedUrl:async(path,seconds)=>{calls.push({name:"signedUrl",args:{path,seconds}});return signedError?{data:null,error:{message:"sign error"}}:{data:{signedUrl:"https://example.supabase.co/storage/signed/canonical"},error:null};}})},auth:{getUser:async token=>token==="valid"?{data:{user:{id:"user",email,email_confirmed_at:confirmed?"now":null}},error:null}:{data:{user:null},error:{message:"bad"}}},rpc:async(name,args)=>{calls.push({name,args});if(name==="content_pipeline_reference_generation_allowed_v1")return {data:true,error:null};if(name==="content_pipeline_visual_recovery_v1")return {data:recovery,error:null};if(name.includes("request_status"))return {data:current,error:null};if(name.includes("approve_visual_request")){current.status="READY_FOR_UPLOAD";return {data:{},error:null};}if(name.includes("fail_visual_request")){current.activeClaim=false;current.status=args.p_status;return {data:{},error:null};}if(name==="content_pipeline_source_stage_status_v1")return{data:{jobId:JOB,status:"STAGED",result:stagedResult},error:null};return{data:{jobId:JOB},error:null};},from:()=>({select:()=>({in:()=>({neq:()=>({eq:()=>({limit:async()=>({data:duplicate?[{pipeline_image_id:2003,status:"DONE"}]:[],error:null})})})}),eq:()=>({maybeSingle:async()=>({data:{pipeline_image_id:jobImage,pipeline_id:21,image_id:"IMG_01",generation_contract:{},generation_contract_hash:"contract",contract_hash:"contract",staging_asset:null,status:"STAGED",result:staged?stagedResult:{}}}),single:async()=>({data:{status:current.status,handoff_phase:current.status==="READY_FOR_UPLOAD"?"READY_FOR_UPLOAD":"PRODUCING",staging_asset:current.status==="READY_FOR_UPLOAD"?{sha256:"a".repeat(64)}:null},error:null})})})})};
 const context={sourceUrl:value=>{const u=new URL(String(value));if(u.protocol!=="https:")throw Error("SOURCE_URL_UNSAFE");return u;},Date,createClient:()=>sb,Deno:{env:{get:key=>key==="CONTENT_FACTORY_MCP_OPERATOR_EMAILS"?(configured?"operator@example.org":""):"https://example.supabase.co"},serve:fn=>{handler=fn;}},Request,Response,Blob,URL,TextEncoder,Uint8Array,Array,Number,JSON,String,Error,btoa};
 const generation=readFileSync(new URL("../../supabase/functions/content-pipeline-visual-mcp/generation.ts",import.meta.url),"utf8").replace(/^import .*;$/gm,"").replace(/export /g,"");
 vm.runInNewContext(ts.transpile(generation,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),context);
 context.loadInspection=async()=>({inspectPixels:async()=>({metadata:{sha256:"a".repeat(64),decode:"PASS"},canonical:new Uint8Array(12),mobile:new Uint8Array(10)})});
 context.loadGeneration=async()=>({validateGenerationSpec:context.validateGenerationSpec,generationCapabilities:context.generationCapabilities,nativeGenerationContext:context.nativeGenerationContext});
 vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),context);
 return {calls,send:async(method="tools/list",args={},name,token="valid",body)=>handler(new Request("https://example.supabase.co/functions/v1/content-pipeline-visual-mcp",{method:"POST",headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{})},body:body??JSON.stringify({jsonrpc:"2.0",id:1,method,params:{name,arguments:args}})}))};
}
test("authentication blocks anonymous, invalid, unconfigured and unapproved users",async()=>{for(const [options,token,status] of [[{},"",401],[{},"bad",401],[{configured:false},"valid",503],[{email:"other@example.org"},"valid",403],[{confirmed:false},"valid",403]]){const h=harness(options);assert.equal((await h.send("ping",{},null,token)).status,status);assert.equal(h.calls.length,0);}});
test("null and arrays are rejected before JSON-RPC access",async()=>{for(const body of ["null","[]"]){assert.equal((await harness().send("ping",{},null,"valid",body)).status,400);}});
test("tool list includes the complete 3-A boundaries with truthful annotations",async()=>{const b=await(await harness().send()).json();assert.equal(b.result.tools.length,15);assert.equal(b.result.tools.find(t=>t.name==="inspect_visual_source").annotations.readOnlyHint,true);assert.equal(b.result.tools.find(t=>t.name==="dispatch_visual_source").annotations.openWorldHint,true);});
test("valid source delegates only bounded named dispatch with server-owned worker",async()=>{const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{sourceAssetUrl:"https://photos.example.org/image.jpg",sourcePageUrl:"https://photos.example.org/page",sourceOwner:"Manufacturer",transform:{maxWidth:780,annotations:[{type:"circle",x:.5,y:.5,radius:.1}]}}},"dispatch_visual_source")).json();assert.equal(b.result.isError,undefined);const call=h.calls.at(-1);assert.equal(call.name,"content_pipeline_dispatch_visual_source_request_v1");assert.equal(call.args.p_worker_key,"mcp-3a-user");});
test("invalid transform/rights fields and inactive claim never dispatch",async()=>{for(const [options,extra] of [[{}, {circle:{x:.5,y:.5,radius:.1}}],[{active:false},{}]]){const h=harness(options);const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{sourceAssetUrl:"https://photos.example.org/image.jpg",sourcePageUrl:"https://photos.example.org/page",sourceOwner:"Manufacturer",transform:extra}},"dispatch_visual_source")).json();assert.equal(b.result.isError,true);assert.equal(h.calls.some(c=>c.name.includes("dispatch")),false);}});
test("cross-image inspection is rejected before storage download",async()=>{const h=harness({jobImage:2001});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB},"inspect_visual_source")).json();assert.equal(b.result.isError,true);assert.match(b.result.content[0].text,/ACCESS_DENIED/);});
test("failure closure re-reads the receipt and never completes",async()=>{const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,status:"RETRY",stage:"SOURCE",code:"DOWNLOAD_FAILED",error:"source unavailable"},"fail_visual_image")).json();assert.equal(b.result.structuredContent.status,"RETRY");assert.equal(b.result.structuredContent.activeClaim,false);assert.equal(h.calls.at(-1).name,"content_pipeline_visual_claim_request_status_v1");assert.equal(h.calls.some(c=>c.name.includes("complete")),false);});
test("closed claim cannot authorize source dispatch",async()=>{const h=harness({active:false});await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{}},"dispatch_visual_source");assert.equal(h.calls.length,1);});

const baseQa={contractHash:"contract",imageQa:"PASS",mobileQa:"PASS",imageSeoQa:"PASS"};
test("approval schema exposes exact role QA fields without prohibiting evidence",async()=>{const b=await(await harness().send()).json();const q=b.result.tools.find(t=>t.name==="approve_visual_source").inputSchema.properties.qa;assert.deepEqual(q.required,Object.keys(baseQa));for(const k of ["representativeImageQa","cardCropQa","heroCropQa"])assert.deepEqual(q.properties[k].enum,["PASS"]);assert.equal(q.additionalProperties,true);});
test("role approval reports every missing field before mutation",async()=>{for(const [role,missing] of [["BODY",[]],["THUMBNAIL",["representativeImageQa","cardCropQa"]],["HERO",["representativeImageQa","heroCropQa"]],["THUMBNAIL_HERO",["representativeImageQa","cardCropQa","heroCropQa"]]]){const h=harness({role});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB,expectedSha:"a".repeat(64),qa:{...baseQa,representative:{status:"PASS"}}},"approve_visual_source")).json();if(missing.length){assert.equal(b.result.isError,true);for(const k of missing)assert.ok(b.result.content[0].text.includes(k));assert.equal(h.calls.some(c=>c.name.includes("approve_visual_request")),false);}else assert.equal(b.result.structuredContent.status,"READY_FOR_UPLOAD");}});
test("hero approval forwards inspected QA and evidence unchanged; rejects mismatch and non-PASS",async()=>{const qa={...baseQa,representativeImageQa:"PASS",cardCropQa:"PASS",heroCropQa:"PASS",evidence:"inspected service crops"};const h=harness({role:"THUMBNAIL_HERO"});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB,expectedSha:"a".repeat(64),qa},"approve_visual_source")).json();assert.equal(b.result.structuredContent.status,"READY_FOR_UPLOAD");assert.deepEqual(h.calls.find(c=>c.name.includes("approve_visual_request")).args.p_qa,qa);for(const change of [{contractHash:"other"},{heroCropQa:"FAIL"}]){const x=harness({role:"THUMBNAIL_HERO"});const bad=await(await x.send("tools/call",{requestId:REQUEST,jobId:JOB,expectedSha:"a".repeat(64),qa:{...qa,...change}},"approve_visual_source")).json();assert.equal(bad.result.isError,true);assert.equal(x.calls.some(c=>c.name.includes("approve_visual_request")),false);}});

test("source usage is readonly and duplicate dispatch stops before creating a job",async()=>{const args={requestId:REQUEST,sourceAssetUrl:"https://photos.example.org/image.jpg"};for(const duplicate of [false,true]){const h=harness({duplicate});const b=await(await h.send("tools/call",args,"check_visual_source_usage")).json();assert.equal(b.result.structuredContent.result,duplicate?"DUPLICATE":"NO_KNOWN_DUPLICATE");assert.equal(b.result.structuredContent.identityScope,"EXACT_URL_ONLY");assert.equal(h.calls.length,1);}const h=harness({duplicate:true});const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{sourceAssetUrl:args.sourceAssetUrl,sourcePageUrl:"https://photos.example.org/page",sourceOwner:"Manufacturer",transform:{}}},"dispatch_visual_source")).json();assert.equal(b.result.isError,true);assert.match(b.result.content[0].text,/DUPLICATE_SOURCE_PREFLIGHT/);assert.equal(h.calls.some(c=>c.name.includes("dispatch")),false);});

test("usage requires receipt and validates source SHA; clear is never QA PASS",async()=>{for(const extra of [{sourceSha256:"bad"},{sourceAssetUrl:"http://photos.example.org/a"}]){const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,sourceAssetUrl:"https://photos.example.org/a",...extra},"check_visual_source_usage")).json();assert.equal(b.result.isError,true);}const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,sourceAssetUrl:"https://photos.example.org/a",sourceSha256:"b".repeat(64)},"check_visual_source_usage")).json();assert.equal(b.result.structuredContent.identityScope,"URL_AND_SOURCE_SHA256");assert.equal(b.result.structuredContent.finalApprovalGateRequired,true);assert.equal(b.result.structuredContent.imageQa,undefined);});

test("maintenance status is read-only and needs no image Claim",async()=>{const h=harness({active:false});const b=await(await h.send("tools/call",{},"get_visual_maintenance_status")).json();assert.equal(b.result.isError,undefined);assert.equal(h.calls.length,1);assert.equal(h.calls[0].name,"content_pipeline_staging_maintenance_status_v1");});

const generationSpec={productionMethod:"REFERENCE_BASED_GENERATION",prompt:"Create a verified oil filter gasket photograph.",references:[{sourcePageUrl:"https://manufacturer.org/filter",sourceOwner:"Manufacturer",verifiedFacts:["Sealing gasket is on the filter base."],pixelsInspected:true,checkedAt:"2026-10-02T01:00:00Z"}],transform:{maxWidth:780}};
test("native file preflight is read-only and never suggests API credentials",async()=>{const h=harness({active:false});const b=await(await h.send("tools/call",{},"get_visual_generation_capabilities")).json();assert.equal(b.result.structuredContent.providerConfigured,false);assert.equal(b.result.structuredContent.nativeFileHandoff,true);assert.equal(b.result.structuredContent.externalGenerationApiAllowed,false);assert.equal(h.calls.length,0);});
const nativeFile={download_url:"https://files.example.org/native.png",file_id:"file_native",mime_type:"image/png"};
test("official fileParams declaration survives security metadata decoration",async()=>{const b=await(await harness().send()).json();const t=b.result.tools.find(t=>t.name==="dispatch_visual_generation");assert.deepEqual(t._meta["openai/fileParams"],["file","inputFile"]);const f=t.inputSchema.properties.file;assert.deepEqual(f.required,["download_url","file_id"]);for(const key of ["download_url","file_id","mime_type","file_name"])assert.ok(f.properties[key]);assert.ok(t._meta.securitySchemes);assert.ok(b.result.tools.find(t=>t.name==="open_visual_file_upload")._meta.ui.resourceUri);});
test("file intake rejects missing file, inactive Claim and hidden spec file injection",async()=>{for(const [opts,args] of [[{},{}],[{active:false},{file:nativeFile}],[{},{spec:{...generationSpec,chatFile:nativeFile}}]]){const h=harness(opts);const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:generationSpec,...args},"dispatch_visual_generation")).json();assert.equal(b.result.isError,true);assert.equal(h.calls.some(c=>c.name==="content_pipeline_dispatch_visual_generation_request_v1"),false);}});
test("file intake binds server worker and delegates the exact native file without caller SHA",async()=>{const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:generationSpec,file:nativeFile},"dispatch_visual_generation")).json();assert.equal(b.result.isError,undefined);const c=h.calls.at(-1);assert.equal(c.name,"content_pipeline_dispatch_visual_generation_request_v1");assert.equal(c.args.p_worker_key,"mcp-3a-user");assert.deepEqual(c.args.p_spec.chatFile,nativeFile);assert.equal(c.args.p_spec.expectedGeneratedSha,undefined);});
test("upload widget opens without dispatch or QA mutation",async()=>{const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:generationSpec},"open_visual_file_upload")).json();assert.equal(b.result.isError,undefined);assert.equal(b.result.structuredContent.pipelineImageId,2000);assert.equal(h.calls.some(c=>c.name.includes("dispatch")),false);});

test("native file with optional SHA dispatches without requiring an asset URL",async()=>{const h=harness();const sha="a".repeat(64);const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{...generationSpec,expectedGeneratedSha:sha},file:nativeFile},"dispatch_visual_generation")).json();assert.equal(b.result.isError,undefined);const c=h.calls.at(-1);assert.equal(c.name,"content_pipeline_dispatch_visual_generation_request_v1");assert.equal(c.args.p_spec.expectedGeneratedSha,sha);assert.deepEqual(c.args.p_spec.chatFile,nativeFile);});

test("Korean labels are advertised and accepted without native generation",async()=>{
 const h=harness(); const list=await(await h.send()).json();
 const branches=list.result.tools.find(t=>t.name==="dispatch_visual_source").inputSchema.properties.spec.properties.transform.properties.annotations.items.oneOf;
 assert.equal(branches.find(b=>b.properties.type.const==="label").properties.fontSize.minimum,14);
 const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{sourceAssetUrl:"https://photos.example.org/image.jpg",sourcePageUrl:"https://photos.example.org/page",sourceOwner:"Manufacturer",transform:{annotations:[{type:"label",text:"배터리",x:.1,y:.1,fontSize:16}]}}},"dispatch_visual_source")).json();
 assert.equal(b.result.isError,undefined);assert.equal(h.calls.at(-1).args.p_spec.transform.annotations[0].text,"배터리");
});
test("invalid Korean labels fail before creating a source job",async()=>{
 for(const extra of [{text:""},{text:"⚠"},{fontSize:12},{text:"가".repeat(17)},{text:"배터리\n"}]){
 const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{sourceAssetUrl:"https://photos.example.org/image.jpg",sourcePageUrl:"https://photos.example.org/page",sourceOwner:"Manufacturer",transform:{annotations:[{type:"label",text:"배터리",x:.1,y:.1,...extra}]}}},"dispatch_visual_source")).json();
 assert.equal(b.result.isError,true);assert.equal(h.calls.some(c=>c.name.includes("dispatch")),false);
 }
});


test("task read exposes the preserved same-contract candidate without promoting QA",async()=>{
 const recovery={jobId:JOB,sha256:"a".repeat(64),canonicalPath:"21/2000/canonical.webp",resumeFrom:"INSPECTION"};
 const h=harness({recovery});const b=await(await h.send("tools/call",{pipelineImageId:2000},"get_visual_image_task")).json();
 assert.equal(b.result.structuredContent.stagingSha,recovery.sha256);
 assert.equal(b.result.structuredContent.stagingApproved,false);
 assert.equal(b.result.structuredContent.recoverableStaging.jobId,JOB);
 assert.equal(b.result.structuredContent.nextAction,"INSPECT_EXISTING_STAGED_JOB");
 assert.equal(h.calls.some(c=>c.name.includes("claim_visual")||c.name.includes("dispatch")),false);
});
test("inspection keeps image content and a fresh verified-path download fallback",async()=>{
 const h=harness({staged:true});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB},"inspect_visual_source")).json();
 assert.equal(b.result.isError,undefined);
 assert.equal(b.result.content.filter(c=>c.type==="image").length,2);
 assert.equal(b.result.structuredContent.semanticQa,"NOT_EVALUATED");
 assert.deepEqual(b.result.content.filter(c=>c.type==="image").map(c=>c.mimeType),["image/png","image/png"]);
 assert.equal(b.result.structuredContent.canonicalImage.derivedFromSha256,"a".repeat(64));
 assert.equal(b.result.structuredContent.inspectionAccess.available,true);
 assert.equal(b.result.structuredContent.inspectionAccess.expectedSha,"a".repeat(64));
 assert.equal(b.result.structuredContent.inspectionAccess.mobileWidth,390);
 assert.equal(h.calls.find(c=>c.name==="signedUrl").args.seconds,600);
});
test("source status renews expired URL; signing failure does not discard image content",async()=>{
 const h=harness({staged:true});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB},"get_visual_source_status")).json();
 assert.equal(b.result.structuredContent.inspectionAccess.available,true);
 const x=harness({staged:true,signedError:true});const r=await(await x.send("tools/call",{requestId:REQUEST,jobId:JOB},"inspect_visual_source")).json();
 assert.equal(r.result.isError,undefined);assert.equal(r.result.content.filter(c=>c.type==="image").length,2);
 assert.equal(r.result.structuredContent.inspectionAccess.failureCode,"INSPECTION_SIGNED_URL_FAILED");
});
test("failure and approval use atomic request-bound server wrappers",async()=>{
 const h=harness();await h.send("tools/call",{requestId:REQUEST,status:"RETRY",stage:"INSPECTION",code:"NO_PIXELS",error:"pixels unavailable"},"fail_visual_image");
 const f=h.calls.find(c=>c.name==="content_pipeline_fail_visual_request_v1");
 assert.equal(f.args.p_request_id,REQUEST);assert.equal(f.args.p_worker_key,"mcp-3a-user");
 assert.equal(h.calls.some(c=>c.name==="content_pipeline_fail_image_v1"),false);
 const x=harness();await x.send("tools/call",{requestId:REQUEST,jobId:JOB,expectedSha:"a".repeat(64),qa:baseQa},"approve_visual_source");
 const a=x.calls.find(c=>c.name==="content_pipeline_approve_visual_request_v1");
 assert.equal(a.args.p_request_id,REQUEST);assert.equal(a.args.p_claim_token,undefined);
});
test("a non-owning receipt cannot dispatch or close another execution",async()=>{
 const h=harness({active:false,claimResult:"CLAIM_NOT_OWNED"});const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:generationSpec,file:nativeFile},"dispatch_visual_generation")).json();
 assert.match(b.result.content[0].text,/CLAIM_NOT_OWNED/);
 await h.send("tools/call",{requestId:REQUEST,status:"RETRY",stage:"CLAIM",code:"CLOSED",error:"not owned"},"fail_visual_image");
 assert.equal(h.calls.some(c=>c.name.includes("dispatch")||c.name.includes("fail_visual_request")),false);
});
test("task-specific native context includes only current Contract and truthful operator retry policy",async()=>{
 const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST},"get_visual_claim_result")).json();
 const p=b.result.structuredContent.nativeGenerationContext;
 assert.equal(p.pipelineImageId,2000);assert.equal(p.generationContractHash,"contract");
 assert.equal(p.inheritPreviousImage,false);assert.equal(p.serverVisionQaSupported,false);
 assert.equal(p.qa.maxAttempts,3);assert.equal(p.qa.status,"NOT_EVALUATED");
 assert.equal(p.referenceImages.length,0);assert.match(p.prompt,/CURRENT TASK ONLY/);
});
test("native packet has no retained context from another task",()=>{
 const generation=readFileSync(new URL("../../supabase/functions/content-pipeline-visual-mcp/generation.ts",import.meta.url),"utf8").replace(/^import .*;$/gm,"").replace(/export /g,"");
 const c={JSON,Array};vm.runInNewContext(ts.transpile(generation,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),c);
 const a=c.nativeGenerationContext(1,"hash-a",{must_show:["oil warning dashboard"]});
 const b=c.nativeGenerationContext(2,"hash-b",{must_show:["right handlebar starter button"]});
 assert.match(a.prompt,/oil warning dashboard/);assert.doesNotMatch(b.prompt,/oil warning dashboard|hash-a/);
 assert.match(b.prompt,/right handlebar starter button/);assert.equal(b.qa.mustShow.length,1);
});
