import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
const source=readFileSync(new URL("../../supabase/functions/content-pipeline-visual-mcp/index.ts",import.meta.url),"utf8").replace(/^import .*;$/gm,"").replaceAll('await import("./generation.ts")','await loadGeneration()').replaceAll('await import("./inspection.ts")','await loadInspection()').replaceAll('await import("./source-resolver.ts")','await loadResolver()').replace('e instanceof Error?e.message:"VISUAL_OPERATION_FAILED"','String(e.message ?? e)');
const REQUEST="11111111-1111-4111-8111-111111111111",JOB="22222222-2222-4222-8222-222222222222";
function harness({email="operator@example.org",confirmed=true,configured=true,active=true,jobImage=2000,role="BODY",duplicate=false,recovery=null,signedError=false,staged=false,missingPixels=false,storageFailsOnce=false,claimResult,executionRole,visualPhase,contract,allowed=true,nativeAudit,nativeInput=null,readJob,auditValidation,auditRecordError}={}){
 let handler;let downloads=0;const calls=[];const logs=[];
 const current={result:claimResult??(active?"CLAIMED":"CLOSED"),failureCode:"MUST_SHOW_MISMATCH",activeClaim:active,status:active?"PROCESSING":"RETRY",claim:{pipelineImageId:2000,pipelineId:21,pipelineImageRunId:3,claimToken:REQUEST,generationContractHash:"contract",generationContract:contract??{asset_role:role},...(executionRole?{executionRole}:{})}};
 const stagedResult={sha256:"a".repeat(64),bucket:"content-pipeline-staging",path:"21/2000/"+"a".repeat(64)+".webp",bytes:12,width:1200,height:675};
 const sb={storage:{from:()=>({download:async()=>{downloads++;return storageFailsOnce&&downloads===1?{data:null,error:{message:"temporary"}}:{data:new Blob([new Uint8Array(12)],{type:"image/webp"}),error:null};},createSignedUrl:async(path,seconds)=>{calls.push({name:"signedUrl",args:{path,seconds}});return signedError?{data:null,error:{message:"sign error"}}:{data:{signedUrl:"https://example.supabase.co/storage/signed/canonical"},error:null};}})},auth:{getUser:async token=>token==="valid"?{data:{user:{id:"user",email,email_confirmed_at:confirmed?"now":null}},error:null}:{data:{user:null},error:{message:"bad"}}},rpc:async(name,args)=>{calls.push({name,args});if(name==="content_pipeline_validate_native_result_v1")return{data:auditValidation??{valid:true,recorded:false},error:null};if(name==="content_pipeline_record_native_attempt_v1"&&auditRecordError)return{data:null,error:{message:auditRecordError}};if(name==="content_pipeline_native_attempt_audit_v1")return{data:nativeAudit??{events:[]},error:null};if(name==="content_pipeline_owned_native_input_v1")return{data:nativeInput,error:null};if(name==="content_pipeline_owned_visual_candidate_v1")return{data:null,error:null};if(name==="content_pipeline_reference_generation_allowed_v1")return {data:allowed,error:null};if(name==="content_pipeline_visual_policy_v1")return {data:{evidenceLevel:"NONE",fullGenerationAllowed:true},error:null};if(contract&&name==="content_pipeline_claim_visual_stage_v1")return {data:current,error:null};if(name==="content_pipeline_owned_visual_recovery_v1")return {data:recovery,error:null};if(name.includes("request_status"))return {data:current,error:null};if(name.includes("approve_visual_request")){current.status="READY_FOR_UPLOAD";return {data:{},error:null};}if(name.includes("fail_visual_request")){current.activeClaim=false;current.status=args.p_status;return {data:{},error:null};}if(name==="content_pipeline_source_stage_status_v1")return{data:{jobId:JOB,status:"STAGED",result:stagedResult},error:null};return{data:{jobId:JOB},error:null};},from:()=>({select:()=>({in:()=>({neq:()=>({eq:()=>({limit:async()=>({data:duplicate?[{pipeline_image_id:2003,status:"DONE"}]:[],error:null})})})}),eq:()=>({maybeSingle:async()=>({data:readJob??{pipeline_image_id:jobImage,pipeline_id:21,image_id:"IMG_01",generation_contract:contract??{},generation_contract_hash:"contract",visual_phase:visualPhase,contract_hash:"contract",staging_asset:null,status:"STAGED",result:staged?stagedResult:{}}}),single:async()=>({data:{status:current.status,handoff_phase:current.status==="READY_FOR_UPLOAD"?"READY_FOR_UPLOAD":"PRODUCING",staging_asset:current.status==="READY_FOR_UPLOAD"?{sha256:"a".repeat(64)}:null},error:null})})})})};
 const context={sourceUrl:value=>{const u=new URL(String(value));if(u.protocol!=="https:")throw Error("SOURCE_URL_UNSAFE");return u;},Date,createClient:()=>sb,Deno:{env:{get:key=>key==="CONTENT_FACTORY_MCP_OPERATOR_EMAILS"?(configured?"operator@example.org":""):"https://example.supabase.co"},serve:fn=>{handler=fn;}},Request,Response,Blob,URL,TextEncoder,Uint8Array,Array,Number,JSON,String,Error,btoa,crypto,console:{warn:value=>logs.push(value),error:value=>logs.push(value)}};
 const generation=readFileSync(new URL("../../supabase/functions/content-pipeline-visual-mcp/generation.ts",import.meta.url),"utf8").replace(/^import .*;$/gm,"").replace(/export /g,"");
 vm.runInNewContext(ts.transpile(generation,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),context);
 const diagnostic=readFileSync(new URL("../../supabase/functions/content-pipeline-visual-mcp/native-audit.ts",import.meta.url),"utf8").replace(/export /g,"");
 vm.runInNewContext(ts.transpile(diagnostic,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),context);
 context.loadResolver=async()=>({resolveSourceAssets:async()=>({result:{claimCreated:false,stagingCreated:false},images:[Uint8Array.from([137,80,78,71,13,10,26,10,...new Uint8Array(24)])]})});
 context.loadInspection=async()=>({inspectPixels:async()=>({metadata:{sha256:"a".repeat(64),decode:"PASS"},canonical:missingPixels?new Uint8Array():Uint8Array.from([137,80,78,71,13,10,26,10,...new Uint8Array(24)]),mobile:Uint8Array.from([137,80,78,71,13,10,26,10,...new Uint8Array(24)]),cardCrop:Uint8Array.from([137,80,78,71,13,10,26,10,...new Uint8Array(24)]),heroCrop:Uint8Array.from([137,80,78,71,13,10,26,10,...new Uint8Array(24)]),crop:{x:0,y:0,width:1200,height:675}})});
 context.loadGeneration=async()=>({validateGenerationSpec:context.validateGenerationSpec,generationCapabilities:context.generationCapabilities,nativeGenerationContext:context.nativeGenerationContext,nativeRecoveryPacket:context.nativeRecoveryPacket,bindNativeAttempt:context.bindNativeAttempt,visualExecutionProtocol:context.visualExecutionProtocol});
 vm.runInNewContext(ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),context);
 return {calls,logs,send:async(method="tools/list",args={},name,token="valid",body)=>handler(new Request("https://example.supabase.co/functions/v1/content-pipeline-visual-mcp",{method:"POST",headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{})},body:body??JSON.stringify({jsonrpc:"2.0",id:1,method,params:{name,arguments:args}})}))};
}
test("authentication blocks anonymous, invalid, unconfigured and unapproved users",async()=>{for(const [options,token,status] of [[{},"",401],[{},"bad",401],[{configured:false},"valid",503],[{email:"other@example.org"},"valid",403],[{confirmed:false},"valid",403]]){const h=harness(options);assert.equal((await h.send("ping",{},null,token)).status,status);assert.equal(h.calls.length,0);}});
test("null and arrays are rejected before JSON-RPC access",async()=>{for(const body of ["null","[]"]){assert.equal((await harness().send("ping",{},null,"valid",body)).status,400);}});
test("tool list includes the complete 3-A boundaries with truthful annotations",async()=>{const b=await(await harness().send()).json();assert.equal(b.result.tools.length,24);assert.equal(b.result.tools.find(t=>t.name==="inspect_visual_source").annotations.readOnlyHint,true);assert.equal(b.result.tools.find(t=>t.name==="dispatch_visual_source").annotations.openWorldHint,true);});
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
 assert.equal(b.result.content.filter(c=>c.type==="image").length,4);
 assert.equal(b.result.structuredContent.semanticQa,"NOT_EVALUATED");
 assert.deepEqual(b.result.content.filter(c=>c.type==="image").map(c=>c.mimeType),["image/png","image/png","image/png","image/png"]);
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
 assert.equal(r.result.isError,undefined);assert.equal(r.result.content.filter(c=>c.type==="image").length,4);
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

test("missing PNG block fails explicitly with preserved recovery metadata",async()=>{
 const h=harness({staged:true,missingPixels:true});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB},"inspect_visual_source")).json();
 assert.equal(b.result.isError,true);const s=b.result.structuredContent;
 assert.equal(s.failureCode,"INSPECTION_IMAGE_BLOCK_MISSING");assert.equal(s.technicalVerification,"FAIL");
 assert.equal(s.technicalQa,"PASS");assert.equal(s.pixelDeliveryQa,"FAIL");assert.equal(s.semanticQa,"BLOCKED");
 assert.equal(s.jobId,JOB);assert.equal(s.inspectionAccess.available,true);
 assert.equal(h.calls.some(c=>c.name.includes("fail_visual")||c.name.includes("dispatch")),false);
});
test("inspection reports server content delivery without claiming client display or semantic QA",async()=>{
 const h=harness({staged:true});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB},"inspect_visual_source")).json();
 assert.equal(b.result.structuredContent.pixelDeliveryQa,"PASS");
 assert.equal(b.result.structuredContent.clientPixelDelivery,"UNVERIFIED_REQUIRES_RENDERING");
 assert.equal(b.result.content[b.result.structuredContent.canonicalImage.contentIndex].type,"image");
 assert.equal(b.result.content[b.result.structuredContent.mobile390Image.contentIndex].type,"image");
});

test("Storage read failure uses bounded same-asset fallback without source dispatch",async()=>{
 const h=harness({staged:true,storageFailsOnce:true});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB},"inspect_visual_source")).json();
 assert.equal(b.result.isError,undefined);assert.equal(b.result.structuredContent.readbackTransport,"STORAGE_INTERNAL_RETRY");
 assert.equal(b.result.content.filter(c=>c.type==="image").length,4);
 assert.equal(h.calls.some(c=>c.name.includes("dispatch")),false);
});

test("semantic rejection delegates exact Job/SHA without closing Claim",async()=>{
 const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB,expectedSha:"a".repeat(64),reason:"SOURCE_MISMATCH",evidence:"Actual pixels show handlebar controls, not engine underside."},"reject_visual_source")).json();
 assert.equal(b.result.isError,undefined);assert.equal(h.calls.at(-1).name,"content_pipeline_reject_visual_source_v1");
 assert.equal(h.calls.some(c=>c.name.includes("fail_visual")),false);
});
test("source spec accepts task-bound pixel gate and unannotated preflight",async()=>{
 const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{sourceAssetUrl:"https://photos.example.org/image.jpg",sourcePageUrl:"https://photos.example.org/page",sourceOwner:"Manufacturer",preflightOnly:true,transform:{maxWidth:1200}}},"dispatch_visual_source")).json();
 assert.equal(b.result.isError,undefined);assert.equal(h.calls.at(-1).args.p_spec.preflightOnly,true);
});
test("preflight QA uses dedicated tool and never invokes approval",async()=>{
 const h=harness({staged:true});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB,expectedSha:"a".repeat(64),preStagingQa:{status:"PASS"}},"record_visual_source_qa")).json();
 assert.equal(b.result.isError,undefined);assert.equal(h.calls.at(-1).name,"content_pipeline_register_pre_staging_qa_v1");
 assert.equal(h.calls.some(c=>c.name.includes("approve_visual_request")),false);
});


test("split stage tools expose separate Claims and exact persistent handoff",async()=>{
 const h=harness();const list=await(await h.send()).json();
 for(const name of ["claim_visual_production","claim_visual_review","handoff_visual_review"])assert.ok(list.result.tools.find(t=>t.name===name));
 for(const [name,role] of [["claim_visual_production","PRODUCER"],["claim_visual_review","REVIEWER"]]){
  const x=harness();await x.send("tools/call",{requestId:REQUEST,pipelineImageId:2000},name);
  const call=x.calls.find(c=>c.name==="content_pipeline_claim_visual_stage_v1");
  assert.equal(call.args.p_role,role);assert.equal(call.args.p_worker_key,"mcp-3a-user");assert.equal(call.args.p_pipeline_image_id,2000);
 }
 const x=harness();await x.send("tools/call",{requestId:REQUEST,jobId:JOB,expectedSha:"a".repeat(64)},"handoff_visual_review");
 const c=x.calls.find(c=>c.name==="content_pipeline_handoff_visual_review_v1");assert.equal(c.args.p_job_id,JOB);assert.equal(c.args.p_expected_sha,"a".repeat(64));
 assert.equal(x.calls.some(c=>c.name.includes("approve")),false);
});

 test("native audit binds authenticated worker and forwards raw evidence even for a closed receipt",async()=>{const h=harness({active:false});const evidence={actualNativeCall:{prompt:"A current task motorcycle cockpit photograph."},outputs:[{fileId:"file_current"}],pixelQa:"FAIL"};const b=await(await h.send("tools/call",{requestId:REQUEST,attemptId:JOB,phase:"RESULT",evidence},"record_visual_generation_attempt")).json();assert.equal(b.result.isError,undefined);const c=h.calls.at(-1);assert.equal(c.name,"content_pipeline_record_native_attempt_v1");assert.equal(c.args.p_worker_key,"mcp-3a-user");assert.deepEqual(c.args.p_evidence,evidence);assert.equal(h.calls.some(c=>c.name.includes("dispatch")),false);});
 test("native audit rejects invalid identity before recording",async()=>{const h=harness();const b=await(await h.send("tools/call",{requestId:REQUEST,attemptId:"wrong",phase:"REQUEST",evidence:{}},"record_visual_generation_attempt")).json();assert.equal(b.result.isError,true);assert.equal(h.calls.some(c=>c.name==="content_pipeline_record_native_attempt_v1"),false);});

test("native audit preflight needs no claim/request and delegates only readonly validator",async()=>{
 const h=harness({active:false});const nativeCall={toolName:"image_gen.text2im",schemaVersion:"RAW_ARGUMENTS_V1",arguments:{prompt:"Actual native prompt for current image task.",size:"1536x1024",n:1}};
 await h.send("tools/call",{nativeCall},"validate_visual_generation_call");
 const c=h.calls.at(-1);assert.equal(c.name,"content_pipeline_validate_native_call_v2");assert.deepEqual(JSON.parse(JSON.stringify(c.args)),{p_call:nativeCall});
 assert.equal(h.calls.some(c=>c.name.includes("claim_request_status")),false);
});

test("nullable native arguments and separate scene instruction pass through without mutation",async()=>{
 const nativeCall={toolName:"image_gen.text2im",schemaVersion:"RAW_ARGUMENTS_V1",arguments:{prompt:null,size:"1536x1024",n:1,referenced_image_ids:null},sceneInstruction:{text:"A realistic stationary motorcycle cockpit photograph.",location:"CONVERSATION_MESSAGE"}};
 const h=harness({active:false});await h.send("tools/call",{nativeCall},"validate_visual_generation_call");
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1).args.p_call)),nativeCall);
 const evidence={contractHash:"a".repeat(64),nativeCall};
 await h.send("tools/call",{requestId:REQUEST,attemptId:JOB,phase:"REQUEST",evidence},"record_visual_generation_attempt");
 assert.deepEqual(JSON.parse(JSON.stringify(h.calls.at(-1).args.p_evidence)),evidence);
 assert.equal(h.calls.some(c=>c.name.includes("dispatch")||c.name.includes("claim_visual_stage")),false);
});

test("source resolver is authenticated read-only before Claim and returns actual image content",async()=>{const h=harness({active:false});const b=await(await h.send("tools/call",{sourcePageUrl:"https://docs.example/manual",sectionQuery:"Instrument Cluster",maxCandidates:2},"resolve_visual_source_assets")).json();assert.equal(b.result.isError,undefined);assert.equal(b.result.content[1].type,"image");assert.equal(h.calls.length,0);});

test('Producer Task and Claim guide handoff, not QA/final dispatch; Reviewer has no generation instruction',async()=>{
 const p=harness({executionRole:'PRODUCER',visualPhase:'PRODUCTION_PENDING'});
 const task=await(await p.send('tools/call',{pipelineImageId:2000},'get_visual_image_task')).json();
 const pp=task.result.structuredContent.preStagingProtocol;
 assert.equal(pp.executionRole,'PRODUCER');assert.equal(pp.qaRecordingAllowed,false);assert.equal(pp.phase2.includes('handoff_visual_review'),true);assert.deepEqual(pp.qaFields,[]);
 const r=harness({executionRole:'REVIEWER',visualPhase:'QA_PENDING'});
 const receipt=await(await r.send('tools/call',{requestId:REQUEST},'get_visual_claim_result')).json();
 assert.equal(receipt.result.structuredContent.nativeGenerationContext,undefined);assert.equal(receipt.result.structuredContent.executionProtocol.nativeGenerationAllowed,false);
});
test('Producer inspection reports scene screening and review handoff',async()=>{
 const h=harness({executionRole:'PRODUCER',staged:true});
 const b=await(await h.send('tools/call',{requestId:REQUEST,jobId:JOB},'inspect_visual_source')).json();
 assert.equal(b.result.structuredContent.preStagingNextAction,'SCREEN_CURRENT_SCENE_THEN_HANDOFF_VISUAL_REVIEW');
 assert.equal(b.result.structuredContent.executionProtocol.qaRecordingAllowed,false);
});

test('full-generation file dispatch uses empty references but remains subject to actual Contract permission',async()=>{
 for(const allowed of [true,false]){
  const h=harness({allowed});const spec={...generationSpec,productionMethod:'NATIVE_FULL_GENERATION',references:[]};
  const b=await(await h.send('tools/call',{requestId:REQUEST,operationId:JOB,spec,file:nativeFile},'dispatch_visual_generation')).json();
  assert.equal(b.result.isError,allowed?undefined:true);assert.equal(h.calls.some(c=>c.name==='content_pipeline_dispatch_visual_generation_request_v1'),allowed);
  const permission=h.calls.find(c=>c.name==='content_pipeline_reference_generation_allowed_v1');assert.equal(permission.args.p_method,'NATIVE_FULL_GENERATION');
 }
});
test('V5 raw Contract and hash remain unchanged with separate server visualPolicy on Task and both claim paths',async()=>{
 const contract={contract_version:5,image_id:'IMG_01',asset_role:'BODY',user_question:'Where is the switch?',visual_objective:'Stationary motorcycle cockpit close up.',must_show:['switch'],must_not_show:['people'],evidence_requirement:{level:'NONE',fact_ids:[]},alt_text_draft:'Motorcycle starter switch'};
 for(const [name,args] of [['get_visual_image_task',{pipelineImageId:2000}],['get_visual_claim_result',{requestId:REQUEST}],['claim_visual_production',{requestId:REQUEST,pipelineImageId:2000}]]){
  const h=harness({contract,executionRole:'PRODUCER'});const b=await(await h.send('tools/call',args,name)).json();const r=b.result.structuredContent;
  assert.equal(b.result.isError,undefined);assert.deepEqual(r.generationContract??r.claim.generationContract,contract);assert.equal(r.generationContractHash??r.claim.generationContractHash,'contract');
  assert.deepEqual(r.visualPolicy,{evidenceLevel:'NONE',fullGenerationAllowed:true});assert.equal(h.calls.filter(c=>c.name==='content_pipeline_visual_policy_v1').length,1);
 }
 const v4=harness({contract:{contract_version:4,asset_role:'BODY'}});await v4.send('tools/call',{pipelineImageId:2000},'get_visual_image_task');assert.equal(v4.calls.some(c=>c.name==='content_pipeline_visual_policy_v1'),false);
});

const auditedAttempt = (changes={}) => ({events:[{attemptId:JOB,phase:"REQUEST",pipelineImageId:2000,contractHash:"contract",evidence:{productionMethod:generationSpec.productionMethod}},{attemptId:JOB,phase:"RESULT",pipelineImageId:2000,contractHash:"contract",evidence:{pixelQa:"PASS",pixelsInspected:true,actualNativeCall:{arguments:{prompt:generationSpec.prompt}},outputs:[{fileId:"file_native"}],inspectedOutput:{fileId:"file_native"},operationId:JOB,...changes}}]});
test("native dispatch links inspected reported output to actual received file without claiming server observed generation",async()=>{
 const h=harness({nativeAudit:auditedAttempt()});const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{...generationSpec,nativeAttemptId:JOB},file:nativeFile},"dispatch_visual_generation")).json();
 assert.equal(b.result.isError,undefined);const binding=h.calls.find(c=>c.name==="content_pipeline_dispatch_visual_generation_request_v1").args.p_spec.nativeAttemptBinding;assert.equal(binding.fileLink,"MATCHED_FILE_ID");assert.equal(binding.serverObservedNativeCall,false);assert.equal(binding.promptLink,"MATCHED_REPORTED_ARGUMENTS");
});
test("known audit prompt/file/operation mismatches stop native dispatch but path-only uncertainty remains explicit",async()=>{
 for(const changes of [{actualNativeCall:{arguments:{prompt:"Different motorcycle scene text here."}}},{outputs:[{fileId:"other"}],inspectedOutput:{fileId:"other"}},{operationId:REQUEST}]){const h=harness({nativeAudit:auditedAttempt(changes)});const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{...generationSpec,nativeAttemptId:JOB},file:nativeFile},"dispatch_visual_generation")).json();assert.equal(b.result.isError,true);assert.equal(h.calls.some(c=>c.name==="content_pipeline_dispatch_visual_generation_request_v1"),false);}
 const h=harness({nativeAudit:auditedAttempt({outputs:[{path:"/mnt/data/current.png"}],inspectedOutput:{path:"/mnt/data/current.png"}})});const b=await(await h.send("tools/call",{requestId:REQUEST,operationId:JOB,spec:{...generationSpec,nativeAttemptId:JOB},file:nativeFile},"dispatch_visual_generation")).json();assert.equal(b.result.isError,undefined);assert.equal(h.calls.find(c=>c.name==="content_pipeline_dispatch_visual_generation_request_v1").args.p_spec.nativeAttemptBinding.fileLink,"UNVERIFIED");
});
test("task read prioritizes failed preserved input recovery after stored candidates, without creating a job",async()=>{
 const input={sourceJobId:JOB,inputSha256:"a".repeat(64),status:"INPUT_PRESERVED",qaStatus:"NOT_EVALUATED"};const h=harness({nativeInput:input});const b=await(await h.send("tools/call",{pipelineImageId:2000},"get_visual_image_task")).json();assert.equal(b.result.structuredContent.recoverableNativeInput.sourceJobId,JOB);assert.equal(b.result.structuredContent.nextAction,"RECLAIM_PRODUCTION_THEN_RESTAGE_PRESERVED_NATIVE_INPUT");assert.equal(h.calls.some(c=>c.name.includes("dispatch")),false);
});

test("failed Job source status does not expose native recovery without current global input admission",async()=>{
 const readJob={job_id:JOB,pipeline_image_id:2000,contract_hash:"contract",status:"FAILED",spec:{...generationSpec,visualMcpOperation:{workerKey:"mcp-3a-user"}},result:{checkpoint:"GENERATED_BINARY_PRESERVED",generatedInput:{bucket:"content-pipeline-staging",path:`21/2000/${"a".repeat(64)}.webp`,sha256:"a".repeat(64),mime:"image/webp",decode:"PASS",signature:"RIFF/WEBP",bytes:200,width:100,height:100}}};
 for(const nativeInput of [null,{sourceJobId:REQUEST,inputSha256:"a".repeat(64)}]){const h=harness({readJob,nativeInput});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB},"get_visual_source_status")).json();assert.equal(b.result.structuredContent.nativeRecovery,null);}
 const h=harness({readJob,nativeInput:{sourceJobId:JOB,inputSha256:"a".repeat(64)}});const b=await(await h.send("tools/call",{requestId:REQUEST,jobId:JOB},"get_visual_source_status")).json();assert.equal(b.result.structuredContent.nativeRecovery.kind,"INPUT_ONLY");
});

test("RESULT preflight is authenticated, read-only and does not record or claim",async()=>{
 const h=harness(), response=await(await h.send("tools/call",{requestId:REQUEST,attemptId:JOB,evidence:{pixelQa:"NOT_INSPECTED"}},"validate_visual_generation_result")).json();
 assert.equal(response.result.structuredContent.valid,true);
 assert.equal(response.result.structuredContent.recorded,false);
 assert.match(response.result.structuredContent.traceId,/^[a-f0-9-]{36}$/);
 assert.deepEqual(h.calls.map(x=>x.name),["content_pipeline_validate_native_result_v1"]);
 assert.equal(h.calls[0].args.p_worker_key,"mcp-3a-user");
});
test("RESULT preflight reports rejection without persisting and traces only safe metadata",async()=>{
 const h=harness({auditValidation:{valid:false,code:"INVALID_NATIVE_OUTPUT_IDENTITY",field:"evidence.outputs",recorded:false}});
 const r=await(await h.send("tools/call",{requestId:REQUEST,attemptId:JOB,evidence:{toolError:"https://secret.invalid/?token=secret"}},"validate_visual_generation_result")).json();
 assert.equal(r.result.structuredContent.valid,false);assert.equal(h.logs.length,1);
 const log=JSON.parse(h.logs[0]);assert.equal(log.stage,"RESULT_PREFLIGHT");assert.equal(log.code,"INVALID_NATIVE_OUTPUT_IDENTITY");
 assert.equal(log.traceId,r.result.structuredContent.traceId);assert.ok(!h.logs[0].includes("secret"));
});
test("record rejection returns correlated code and field without logging raw evidence or leaking capabilities",async()=>{
 const h=harness({auditRecordError:"INVALID_NATIVE_CALL_ARGUMENTS: actualNativeCall.arguments: object required"});
 const r=await(await h.send("tools/call",{requestId:REQUEST,attemptId:JOB,phase:"RESULT",evidence:{toolError:"https://secret.invalid/?token=secret"}},"record_visual_generation_attempt")).json();
 assert.equal(r.result.isError,true);const d=r.result.structuredContent;
 assert.equal(d.code,"INVALID_NATIVE_CALL_ARGUMENTS");assert.equal(d.field,"actualNativeCall.arguments");assert.equal(d.evidenceRecorded,null);assert.equal(d.evidenceWriteOutcome,"UNVERIFIED_REQUIRES_READBACK");
 assert.equal(JSON.parse(h.logs[0]).traceId,d.traceId);assert.ok(!JSON.stringify(r).includes("secret"));
 assert.ok(!h.calls.some(x=>x.name.includes("fail_visual")||x.name.includes("dispatch")));
});
test("unexpected DB error details are replaced by a safe trace code",async()=>{
 const h=harness({auditRecordError:"database detail https://secret.invalid/?token=secret"});
 const r=await(await h.send("tools/call",{requestId:REQUEST,attemptId:JOB,phase:"RESULT",evidence:{}},"record_visual_generation_attempt")).json();
 assert.equal(r.result.structuredContent.code,"VISUAL_OPERATION_FAILED");assert.ok(!JSON.stringify(r).includes("secret"));assert.ok(!h.logs.join("").includes("secret"));
});
