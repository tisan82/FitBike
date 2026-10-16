import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const magickPath=process.env.MAGICK_WASM_MODULE??require.resolve('@imagemagick/magick-wasm');
const {ImageMagick,initializeImageMagick,MagickFormat,MagickColors,MagickGeometry,MagickImage}=await import(magickPath);
await initializeImageMagick(readFileSync(new URL('./magick.wasm','file://'+magickPath)));
const pixels={ImageMagick,MagickFormat,MagickGeometry,MagickImage,Uint8Array,TextDecoder,Error,Math,Array};
const inspection=readFileSync(new URL('../../supabase/functions/content-pipeline-visual-mcp/inspection.ts',import.meta.url),'utf8');
vm.runInNewContext(ts.transpile(inspection.slice(inspection.indexOf('export function probeRaster')).replaceAll('export ',''),{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),pixels);
const bytes=ImageMagick.read(MagickColors.Red,1200,800,img=>img.write(MagickFormat.Png,data=>Uint8Array.from(data)));
const digest=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
const id='11111111-1111-4111-8111-111111111111';
const input=()=>({pipelineRunId:3,pipelineImageId:10,operationId:id,contractHash:'a'.repeat(64),sourceRole:'PRODUCTION_INPUT',sourceAssetUrl:'https://manufacturer.org/source.png',sourcePageUrl:'https://manufacturer.org/page',sourceOwner:'Manufacturer',nativeEditRequired:false,sourceObservation:{expectedSha:digest,pixelsInspected:true,evidence:'Parked motorcycle and wheel area observed in actual source pixels.'}});
function harness({downloadBytes=bytes,downloadMime='image/png',replay=false,corruptRead=false,uploadFails=false,finishFails=false}={}){
 const calls=[],objects=new Map();
 const source=readFileSync(new URL('../../supabase/functions/content-pipeline-visual-mcp/authoring-supply.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','').replace('await import("./inspection.ts")','await loadInspection()');
 const signatureSource=readFileSync(new URL('../../supabase/functions/content-pipeline-source-stage/source.ts',import.meta.url),'utf8');
 const signature=signatureSource.slice(signatureSource.indexOf('export function verifySourceSignature'),signatureSource.indexOf('// Resolve every redirect')).replaceAll('export ','');
 const ctx={crypto:webcrypto,URL,Uint8Array,Blob,Array,Number,String,Error,TextDecoder,
  sourceUrl:x=>{const u=new URL(x);if(u.protocol!=='https:'||u.username||u.password)throw Error('SOURCE_URL_UNSAFE');return u;},
  loadInspection:async()=>({probeRaster:pixels.probeRaster}),
  downloadSource:async(url,file)=>{calls.push({name:'download',url,file});return{bytes:downloadBytes,mime:downloadMime,finalUrl:url,redirects:[]};}};
 vm.runInNewContext(ts.transpile(signature+source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),ctx);
 const rpc=async(name,args)=>{calls.push({name,args});if(name==='content_pipeline_prepare_source_supply_v1')return{supplyId:id,pipelineId:5,pipelineImageId:10,status:replay?'READY':'PREPARING'};if(name==='content_pipeline_finish_source_supply_v1'){if(finishFails)throw Error('SUPPLY_BIND_FAILED');return{supplyId:id,status:'READY',proof:args.p_proof};}return{};};
 const sb={storage:{from:bucket=>{assert.equal(bucket,'content-pipeline-native-handoff');return{
  upload:async(path,b,options)=>{calls.push({name:'upload',path,options});if(uploadFails)return{error:{message:'network failure'}};objects.set(path,Uint8Array.from(b));return{error:null};},
  download:async path=>({data:new Blob([corruptRead?Uint8Array.from([1,2,3]):objects.get(path)],{type:'image/png'}),error:null}),
 };}}};
 return{calls,objects,recordableSourceUrl:ctx.recordableSourceUrl,call:(a=input(),name='persist_authoring_source')=>ctx.executeAuthoringSupply(name,a,{worker:'server-derived-operator',sb,rpc})};
}
test('Source original is decoded, preserved byte-for-byte and read-back proof alone reaches finish',async()=>{
 const h=harness();const r=await h.call();assert.equal(r.result.status,'READY');
 const proof=h.calls.find(c=>c.name==='content_pipeline_finish_source_supply_v1').args.p_proof;
 assert.equal(proof.sha256,digest);assert.equal(proof.width,1200);assert.equal(proof.height,800);assert.equal(proof.byteSize,bytes.length);
 assert.deepEqual([...h.objects.values()][0],bytes);assert.equal(h.calls.some(c=>c.name.includes('claim_visual')),false);
 assert.equal(h.calls.find(c=>c.name==='content_pipeline_prepare_source_supply_v1').args.p_worker_key,'server-derived-operator');
});
test('preview returns actual pixels and original SHA but no semantic QA or supply write',async()=>{
 const h=harness();const r=await h.call({sourceAssetUrl:'https://manufacturer.org/source.png'},'preview_authoring_source');
 assert.equal(r.result.originalSha,digest);assert.equal(r.result.pixelsInspected,false);assert.ok(r.images[0].length>12);
 assert.equal(h.calls.some(c=>c.name.startsWith('content_pipeline_')),false);
});
test('absent pixels, wrong observed SHA and corrupt readback never finalize Source',async()=>{
 for(const mode of ['not-observed','wrong-sha','corrupt-read']){
  const h=harness({corruptRead:mode==='corrupt-read'}),a=input();
  if(mode==='not-observed')a.sourceObservation.pixelsInspected=false;
  if(mode==='wrong-sha')a.sourceObservation.expectedSha='b'.repeat(64);
  await assert.rejects(h.call(a));assert.equal(h.calls.some(c=>c.name==='content_pipeline_finish_source_supply_v1'),false);
 }
});
test('decode/signature failures and PDF cannot register as a photo input',async()=>{
 for(const opts of [{downloadBytes:Uint8Array.from([1,2,3]),downloadMime:'image/png'},{downloadBytes:new Uint8Array(30),downloadMime:'application/pdf'}]){
  const h=harness(opts);await assert.rejects(h.call());assert.equal(h.calls.some(c=>c.name==='upload'),false);
 }
});
test('completed operation replay returns receipt without downloading or replacing bytes',async()=>{
 const h=harness({replay:true});assert.equal((await h.call()).result.status,'READY');assert.equal(h.calls.some(c=>c.name==='download'),false);
});
test('official file download URL is transient and omitted from persisted intent/provenance',async()=>{
 const h=harness(),a={...input(),file:{file_id:'file-current-photo',download_url:'https://files.example.org/current.png?token=secret'}};
 await h.call(a);const prep=h.calls.find(c=>c.name==='content_pipeline_prepare_source_supply_v1').args;
 assert.equal(JSON.stringify(prep).includes('token=secret'),false);assert.equal(JSON.stringify(prep).includes('file-current-photo'),false);
 assert.equal(h.calls.find(c=>c.name==='download').file,true);
});
test('Storage upload or binding failures never claim supply completion',async()=>{
 for(const opts of [{uploadFails:true},{finishFails:true}]){const h=harness(opts);await assert.rejects(h.call());}
});
test('Source provenance cannot persist capability URLs',()=>{
 const h=harness();for(const query of ['?token=secret','?X-Amz-Signature=secret','?key=secret'])assert.throws(()=>h.recordableSourceUrl('https://manufacturer.org/photo.png'+query),/CAPABILITY_URL/);
});

// Authoring envelope validation and readback use the same runtime module.
function authoringHarness(rows=[],pipeline={pipeline_id:110,stage:'WRITING',topic_key:'topic',writer_artifact:{}}){
 const code=readFileSync(new URL('../../supabase/functions/content-pipeline-visual-mcp/authoring-supply.ts',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replaceAll('export ','');
 const context={URL,crypto:webcrypto,Error,Array,Number,String,JSON,Uint8Array,Blob};
 const api=vm.runInNewContext('(()=>{'+ts.transpile(code,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022})+';return {executeAuthoringSupply,authoringDiagnostic,authoringPackageSchema};})()',context);
 const calls=[];const reads=[];
 const sb={from:table=>({select:columns=>{let found=table==='19_content_pipeline_run'?rows:[pipeline];reads.push({table,columns});const q={eq:(key,value)=>{reads.push({key,value});found=found.filter(r=>key.startsWith('metadata->>')?r.metadata?.[key.slice(11)]===value:r[key]===value);return q;},order:()=>q,limit:n=>{found=found.slice(0,n);return q;},maybeSingle:async()=>({data:found[0]??null,error:null})};return q;}})};
 const rpc=async(name,args)=>{calls.push({name,args});return {stage:'DRAFTED'};};
 return {...api,calls,reads,call:(name,args)=>api.executeAuthoringSupply(name,args,{worker:'owner',sb,rpc})};
}
const authoringInput=()=>({pipelineId:110,pipelineRunId:419,package:{version:1,execution:{pipelineId:110,pipelineRunId:419,topicKey:'topic'},planning:{customer_question:'Question'},research:{fact_register:[]},writer:{final_title:'Title',image_briefs:[{contract_version:5,image_id:'IMG_01',asset_role:'BODY',user_question:'What is visible?',visual_objective:'Show parked motorcycle',must_show:['parked motorcycle'],must_not_show:['moving motorcycle'],evidence_requirement:{level:'NONE',fact_ids:[]},alt_text_draft:'Parked motorcycle'}]}}});
test('exact V1 package reaches completion RPC without changing caller content',async()=>{
 const h=authoringHarness(),a=authoringInput();assert.equal((await h.call('complete_content_authoring',a)).result.stage,'DRAFTED');
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].args.p_package,a.package);
 assert.equal(h.authoringPackageSchema.additionalProperties,false);
});
test('wrong envelope, server-managed fields and mismatched Run fail before mutation with exact paths',async()=>{
 for(const [change,field] of [
  [a=>a.package.version='1','package.version'],[a=>delete a.package.version,'package.version'],
  [a=>a.package.sources=[],'package.sources'],[a=>a.package.writer.authoringContext={},'package.writer.authoringContext'],
  [a=>a.package.planning={},'package.planning'],[a=>a.package.research=[], 'package.research'],
  [a=>a.package.execution.pipelineRunId=420,'package.execution.pipelineRunId'],
  [a=>a.package.writer.image_briefs[0].contract_version='5','package.writer.image_briefs[0].contract_version'],
  [a=>a.package.writer.image_briefs[0].asset_role='IMAGE','package.writer.image_briefs[0].asset_role'],
  [a=>a.package.writer.image_briefs[0].evidence_requirement.fact_ids=['CF-1'],'package.writer.image_briefs[0].evidence_requirement.fact_ids[0]'],
 ]){
  const h=authoringHarness(),a=authoringInput();change(a);let err;try{await h.call('complete_content_authoring',a);}catch(e){err=e;}
  assert.ok(err,field);const d=h.authoringDiagnostic(err,'complete_content_authoring');assert.equal(d.field,field);assert.equal(d.mutationOutcome,'NOT_ATTEMPTED');assert.equal(h.calls.length,0);
 }
});
test('Authoring DB rejection retains code; transport failure requires readback and never includes payload',()=>{
 const h=authoringHarness();for(const code of ['AUTHORING_PACKAGE_INVALID','AUTHORING_EXECUTION_BUSY','SUPPLY_OWNER_MISMATCH']){
  const d=h.authoringDiagnostic(new Error(code),'complete_content_authoring');assert.equal(d.code,code);assert.equal(d.mutationOutcome,'REJECTED');
 }
 const d=h.authoringDiagnostic(new Error('network failed private content'),'complete_content_authoring');assert.equal(d.mutationOutcome,'UNVERIFIED_REQUIRES_READBACK');assert.equal(JSON.stringify(d).includes('private content'),false);
});
const authoringRun=(status='RUNNING',owner='owner')=>({pipeline_run_id:419,pipeline_id:110,status,stage:'WRITING',metadata:{executionMode:'AUTHORING_V1',sourceSupplyWorkerKey:owner,authoringRequestId:id,targetPipelineId:null,...(status==='PASS'?{sourceSupplyCompleted:true}:{})}});
test('Authoring status recovers active same Run and original intent without image Claim lookup or writes',async()=>{
 const h=authoringHarness([authoringRun()]);const {result:r}=await h.call('get_authoring_execution_status',{pipelineId:110,requestId:id});
 assert.equal(r.activeExecution,true);assert.equal(r.pipelineRunId,419);assert.equal(r.requestId,id);assert.equal(r.targetPipelineId,null);assert.equal(r.packageExecution.topicKey,'topic');assert.equal(r.contentSaved,false);assert.equal(h.calls.length,0);
 assert.ok(h.reads.some(x=>x.key==='metadata->>sourceSupplyWorkerKey'&&x.value==='owner'));
});
test('Authoring status excludes other operator, unrelated request, and non-Authoring runs',async()=>{
 for(const row of [authoringRun('RUNNING','other'),{...authoringRun(),metadata:{...authoringRun().metadata,executionMode:'VISUAL'}}]){
  const h=authoringHarness([row]);assert.equal((await h.call('get_authoring_execution_status',{pipelineId:110})).result.result,'NOT_FOUND');
 }
 const h=authoringHarness([authoringRun()]);assert.equal((await h.call('get_authoring_execution_status',{requestId:'22222222-2222-4222-8222-222222222222'})).result.result,'NOT_FOUND');
 await assert.rejects(h.call('get_authoring_execution_status',{}));assert.equal(h.calls.length,0);
});
test('completed Authoring run directs Source resume and remains read-only',async()=>{
 const h=authoringHarness([authoringRun('PASS')],{pipeline_id:110,stage:'DRAFTED',topic_key:'topic',writer_artifact:{}});
 const r=(await h.call('get_authoring_execution_status',{pipelineId:110})).result;
 assert.equal(r.activeExecution,false);assert.equal(r.contentSaved,true);assert.equal(r.nextAction,'GET_AUTHORING_SOURCE_SUPPLY');assert.equal(h.calls.length,0);
});
