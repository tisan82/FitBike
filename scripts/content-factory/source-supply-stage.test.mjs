import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
const sha = b => createHash('sha256').update(b).digest('hex');
const code=readFileSync(new URL('../../supabase/functions/content-pipeline-source-stage/supply-input.ts',import.meta.url),'utf8').replaceAll('export ','');
const ctx={Error,Number};vm.runInNewContext(ts.transpile(code,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),ctx);
const bytes=Uint8Array.from([137,80,78,71,13,10,26,10]),hash=sha(bytes),id='11111111-2222-4333-8444-555555555555';
const intent={sourceKind:'REAL_SOURCE',sourcePageUrl:'https://manufacturer.org/page',sourceAssetUrl:'https://manufacturer.org/photo.png',sourceOwner:'Manufacturer',nativeEditRequired:false,sourceObservation:{pixelsInspected:true,expectedSha:hash}};
const proof={storageBucket:'content-pipeline-native-handoff',storagePath:`authoring-supply/83/45307/${id}/${hash}.png`,sha256:hash,mimeType:'image/png',byteSize:bytes.length,width:800,height:600,decodeVerified:true,signatureVerified:true};
const supply={supply_id:id,pipeline_id:83,pipeline_image_id:45307,contract_hash:'contract',status:'READY',selected:true,source_role:'PRODUCTION_INPUT',intent,proof};
const current={pipelineId:83,pipelineImageId:45307,contractHash:'contract',spec:{sourceSupplyId:id,sourcePageUrl:intent.sourcePageUrl,sourceAssetUrl:intent.sourceAssetUrl,sourceOwner:intent.sourceOwner,preflightOnly:true}};
let reads=0;
const execute=(c=current,r=supply,data=bytes,mime='image/png')=>ctx.readStoredSuppliedSource(c,r,async path=>{reads++;assert.equal(path,proof.storagePath);return{bytes:data,mime};},async b=>({sha256:sha(b),bytes:b.length}));
test('original immutable supply bytes reused without URL fetch or QA inheritance',async()=>{const result=await execute();assert.deepEqual(result.bytes,bytes);assert.equal(result.originalSha256,hash);assert.equal(result.sourceSupplyId,id);assert.equal(result.qaStatus,undefined);assert.equal(result.canonicalSha256,undefined);});
for(const [name,patch] of [['task',{pipelineImageId:45308}],['pipeline',{pipelineId:84}],['contract',{contractHash:'changed'}]])test(`foreign ${name} denied before read`,async()=>{reads=0;await assert.rejects(execute({...current,...patch}),/ACCESS_DENIED/);assert.equal(reads,0);});
for(const [name,patch] of [['superseded',{status:'SUPERSEDED'}],['unselected',{selected:false}],['reference',{source_role:'REFERENCE_ONLY'}],['native required',{intent:{...intent,nativeEditRequired:true}}],['uninspected',{intent:{...intent,sourceObservation:{pixelsInspected:false,expectedSha:hash}}}],['attestation SHA',{intent:{...intent,sourceObservation:{pixelsInspected:true,expectedSha:'a'.repeat(64)}}}],['decode',{proof:{...proof,decodeVerified:false}}]])test(`${name} supply denied before read`,async()=>{reads=0;await assert.rejects(execute(current,{...supply,...patch}),/ACCESS_DENIED/);assert.equal(reads,0);});
test('foreign path and bucket rejected before read',async()=>{for(const patch of [{storagePath:proof.storagePath.replace('/83/','/84/')},{storageBucket:'public'},{mimeType:'application/pdf'}]){reads=0;await assert.rejects(execute(current,{...supply,proof:{...proof,...patch}}),/ASSET_INVALID/);assert.equal(reads,0);}});
test('tampered content and storage MIME fail before transform',async()=>{await assert.rejects(execute(current,supply,Uint8Array.from([137,80,78,71,13,10,26,11])),/IDENTITY_MISMATCH/);await assert.rejects(execute(current,supply,bytes,'image/jpeg'),/IDENTITY_MISMATCH/);});
test('supply cannot override generation/composition/recovery or provenance',async()=>{for(const patch of [{productionMethod:'NATIVE_FULL_GENERATION'},{composition:{}},{resumeJobId:'parent'},{preStagingQa:{sourceJobId:'parent'}},{sourcePdfPage:1}])await assert.rejects(execute({...current,spec:{...current.spec,...patch}}),/INPUT_CONFLICT/);await assert.rejects(execute({...current,spec:{...current.spec,sourceOwner:'Other'}}),/PROVENANCE_MISMATCH/);});

async function executeSupplyWorker(spec, {readError=null, previous=null}={}) {
 let harness=readFileSync(new URL('./visual-pre-staging-worker.test.mjs',import.meta.url),'utf8').split('const source={')[0].replace(/^import.*;\n/,'');
 harness=harness.replace('const ctx={Deno:', 'const ctx={readStoredSourceCandidate:resumeReader,readStoredSuppliedSource:supplyReader,verifySourceSignature:()=>{},Deno:');
 harness=harness.replace('const chain=(table,patch)=>', 'map.set(supplyRow.proof.storagePath,new Blob([supplyBytes],{type:supplyRow.proof.mimeType})); if(previous?.result?.path)map.set(previous.result.path,new Blob([canonicalBytes],{type:"image/webp"}));\n const chain=(table,patch)=>');
 harness=harness.replace("single:async()=>({data:table==='21_content_pipeline_image'?", "single:async()=>({data:table==='content_pipeline_visual_supply'?supplyRow:table==='21_content_pipeline_image'?");
 harness=harness.replace("{generation_contract:{},generation_contract_hash:'hash'}", "{pipeline_id:5,generation_contract:{},generation_contract_hash:'hash',visual_phase:'REVIEWING',review_candidate:{jobId:'parent'}}");
 harness=harness.replace("if(name==='content_pipeline_pre_staging_gate_v1')", "if(name==='content_pipeline_review_candidate_v1')return{data:{contractHash:'hash'},error:null};if(name==='content_pipeline_pre_staging_gate_v1')");
 harness=harness.replace('download:async path=>({data:map.get(path)', 'download:async path=>(readError&&path.startsWith("authoring-supply/")?{data:null,error:readError}:({data:map.get(path)').replace("{message:'missing'}}),upload", "{message:'missing'}})),upload");
 harness=harness.replace('downloadSource:async()=>({','downloadSource:async()=>{throw Error("UNEXPECTED_URL_FETCH");return({').replace('redirects:[]}),generateAsset','redirects:[]});},generateAsset');
 harness=harness.replaceAll('import.meta.url',JSON.stringify(import.meta.url));harness+='\n globalThis.executeWorker=execute;';
 const fixture={...supply,pipeline_id:5,pipeline_image_id:10,contract_hash:'hash',proof:{...proof,storagePath:`authoring-supply/5/10/${id}/${hash}.png`}};
 const resumeCode=readFileSync(new URL('../../supabase/functions/content-pipeline-source-stage/source-resume.ts',import.meta.url),'utf8').replace(/^import type .*;\n/gm,'').replaceAll('export ','');
 const resumeCtx={Uint8Array,JSON,Error};vm.runInNewContext(ts.transpile(resumeCode,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),resumeCtx);
 const h={webcrypto,Buffer,URL,readFileSync,vm,ts,test,assert,Request,Response,Blob,Uint8Array,Date,JSON,Array,Number,String,Error,Math,Map,btoa,atob,supplyReader:ctx.readStoredSuppliedSource,supplyRow:fixture,supplyBytes:bytes,readError,canonicalBytes:Uint8Array.from([2,2,2]),resumeReader:resumeCtx.readStoredSourceCandidate};
 vm.runInNewContext(harness,h);
 return h.executeWorker({spec,previous,gate:spec.preflightOnly===false?'PASS':'PREFLIGHT_ONLY'});
}
test('Stage worker consumes stored supply, keeps original SHA and performs canonical readback',async()=>{
 const result=await executeSupplyWorker({...current.spec,transform:{}});
 assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.generatedCalls,0);
 assert.equal(result.result.preStagingSourceSha256,hash);assert.equal(result.result.provenance.originalSha256,hash);
 assert.equal(result.result.provenance.sourceSupplyId,id);assert.notEqual(result.result.sha256,hash);
 assert.equal(result.result.storageVerification,'PASS');assert.equal(result.result.imageQa,'PENDING');assert.equal(result.result.mobileQa,'PENDING');
 assert.equal(result.calls.find(x=>x.name==='content_pipeline_pre_staging_gate_v1').args.p_source_sha,hash);
});
test('missing supply object distinguishes permanent 404 from transient Storage failures',async()=>{
 for(const readError of [{statusCode:'404'},{status:404},{statusCode:'503'},{message:'network unavailable'}]){
  const result=await executeSupplyWorker({...current.spec,transform:{}},{readError});
  assert.equal(result.status,422);assert.equal(result.body.error,Number(readError.statusCode??readError.status)===404?'SOURCE_SUPPLY_ASSET_MISSING':'SOURCE_SUPPLY_STORAGE_UNAVAILABLE');
 }
});
test('Reviewer finalizes supplied source from stored canonical without raw supply or URL fetch',async()=>{
 const canonicalBytes=Uint8Array.from([2,2,2]),canonical=sha(canonicalBytes);
 const spec={...current.spec,transform:{maxWidth:780},visualMcpOperation:{workerKey:'worker'}};
 const previous={job_id:'parent',pipeline_id:5,pipeline_image_id:10,contract_hash:'hash',status:'STAGED',spec,result:{bucket:'content-pipeline-staging',path:`5/10/${canonical}.webp`,sha256:canonical,bytes:3,width:780,height:500,decode:'PASS',storageVerification:'PASS',preflightOnly:true,preStagingSourceSha256:hash,provenance:{sourceMime:'image/png',sourceSha256:hash,originalSha256:hash,sourceSupplyId:id}}};
 const finalized={...spec,preflightOnly:false,preStagingQa:{sourceJobId:'parent',sourceSha256:hash},transform:{...spec.transform,annotations:[{type:'circle',x:.5,y:.5,radius:.1}]}};
 const result=await executeSupplyWorker(finalized,{previous,readError:{status:404}});
 assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.result.preflightOnly,false);
 assert.equal(result.result.provenance.originalSha256,hash);assert.equal(result.result.preStagingSourceSha256,hash);
 assert.equal(result.result.annotationApplied,true);assert.equal(result.result.storageVerification,'PASS');
 const denied=await executeSupplyWorker({...finalized,sourceSupplyId:'99999999-2222-4333-8444-555555555555'},{previous});
 assert.equal(denied.status,422);assert.equal(denied.body.error,'SOURCE_RESUME_PROVENANCE_MISMATCH');
});
