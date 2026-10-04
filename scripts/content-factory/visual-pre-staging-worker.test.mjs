import {readFileSync} from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import {webcrypto} from 'node:crypto';
const code=readFileSync(new URL('../../supabase/functions/content-pipeline-source-stage/index.ts',import.meta.url),'utf8').replace(/^import(?:[\s\S]*?)?;\n/gm,'');
const sha=async b=>Buffer.from(await webcrypto.subtle.digest('SHA-256',b)).toString('hex');
const normalized=Uint8Array.from([2,2,2]),final=Uint8Array.from([3,3,3]);
async function execute({spec,gate='PREFLIGHT_ONLY',previous=null,changedPanel=false}){
 let handler;const map=new Map();const calls=[];let result;let comps=0;
 const proof=async bytes=>({sha256:await sha(bytes),bytes:bytes.length,width:780,height:500,mime:'image/webp',decode:'PASS'});
 if(previous?.result?.generatedInput)map.set(previous.result.generatedInput.path,new Blob([normalized],{type:'image/webp'}));
 const chain=(table,patch)=>{const c={eq:()=>c,select:()=>c,maybeSingle:async()=>({data:{job_id:'job'},error:null}),single:async()=>({data:table==='21_content_pipeline_image'?{generation_contract:{},generation_contract_hash:'hash'}:previous,error:null}),then:resolve=>resolve({data:null,error:null})};if(patch?.status==='STAGED')result=patch.result;return c;};
 const sb={rpc:async(name,args)=>{calls.push({name,args});if(name==='content_pipeline_consume_source_stage_ticket_v1')return{data:{spec,pipelineImageId:10,pipelineId:5,contractHash:'hash'},error:null};if(name==='content_pipeline_pre_staging_gate_v1')return{data:{status:gate},error:null};return{data:true,error:null};},from:table=>({select:()=>chain(table),update:patch=>chain(table,patch),delete:()=>chain(table),insert:async()=>({error:null})}),storage:{from:()=>({download:async path=>({data:map.get(path),error:map.has(path)?null:{message:'missing'}}),upload:async(path,bytes,options)=>{map.set(path,new Blob([bytes],{type:options.contentType}));return{error:null};},createSignedUrl:async()=>({data:{signedUrl:'https://storage.example/image'},error:null})})}};
 const ctx={Deno:{env:{get:()=>''},serve:f=>handler=f},createClient:()=>sb,Request,Response,Blob,Uint8Array,Date,JSON,Array,Number,String,Error,Math,Map,btoa,atob,sourceUrl:x=>new URL(x),validateTransform:x=>({...x}),validateComposition:x=>x,sha256:sha,inspectWebp:async b=>proof(b),transformSource:async(b,m,t)=>{calls.push({name:'transform',annotations:t.annotations});return {webp:t.annotations?.length?final:normalized};},downloadSource:async()=>({bytes:Uint8Array.from([1,1,1]),mime:'image/jpeg',finalUrl:spec.sourceAssetUrl,redirects:[]}),generateAsset:async()=>({bytes:Uint8Array.from([9,9,9]),mime:'image/png',finalUrl:null,redirects:[],generation:{inputSha256:'original-generated-sha'}}),composeSources:async c=>{comps++;if(comps===2&&changedPanel){assert.equal(c.sources[0].expectedSourceSha,'panel-sha');throw Error('COMPOSITION_SOURCE_SHA_MISMATCH');}return {webp:normalized,provenance:c.sources.map(p=>({...p,sourceSha256:'panel-sha'})),recipe:c};}};
 vm.runInNewContext(ts.transpile(code,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}),ctx);
 const response=await handler(new Request('https://worker.example',{method:'POST',body:JSON.stringify({jobId:'11111111-1111-4111-8111-111111111111'})}));return{status:response.status,body:await response.json(),calls,result};
}
const source={sourceAssetUrl:'https://manufacturer.org/source.jpg',sourcePageUrl:'https://manufacturer.org/page',sourceOwner:'Manufacturer',transform:{annotations:[{type:'label',text:'target',x:.5,y:.5}]}};
test('unverified source becomes preview with no annotation; verified source may transform',async()=>{
 const p=await execute({spec:source});assert.equal(p.status,200);assert.equal(p.result.preflightOnly,true);assert.equal(p.result.annotationApplied,false);assert.equal(p.calls.find(x=>x.name==='transform').annotations,undefined);
 const f=await execute({spec:source,gate:'PASS'});assert.equal(f.result.preflightOnly,false);assert.equal(f.result.annotationApplied,true);
});
test('generated PNG normalized SHA is preserved through preview and native resume',async()=>{
 const spec={productionMethod:'REFERENCE_BASED_GENERATION',prompt:'Current task only prompt',references:[],visualMcpOperation:{workerKey:'worker'},transform:{}};
 const p=await execute({spec});assert.equal(p.status,200);assert.equal(p.result.preStagingSourceSha256,await sha(normalized));
 const previous={pipeline_image_id:10,contract_hash:'hash',spec,result:p.result};
 const f=await execute({spec:{...spec,resumeJobId:'previous'},gate:'PASS',previous});assert.equal(f.status,200);assert.equal(f.result.preStagingSourceSha256,p.result.preStagingSourceSha256);
});
test('AI edit identity also uses normalized generated binary, not reference original SHA',async()=>{
 const p=await execute({spec:{productionMethod:'REAL_SOURCE_AI_EDIT',inputAssetUrl:'https://manufacturer.org/original.jpg',prompt:'Edit current task only',references:[],transform:{}}});
 assert.equal(p.status,200);assert.equal(p.result.preStagingSourceSha256,await sha(normalized));
});
test('composition removes labels before gate and pins panel identity on final labelled render',async()=>{
 const spec={...source,transform:{maxWidth:1170},composition:{layout:'SIDE_BY_SIDE',sources:[{...source,label:'Target A'},{...source,sourceAssetUrl:'https://manufacturer.org/b.jpg',label:'Target B'}]}};
 const p=await execute({spec});assert.equal(p.status,200);assert.equal(p.result.preflightOnly,true);assert.equal(p.result.preStagingSourceSha256,await sha(normalized));
 const f=await execute({spec,gate:'PASS',changedPanel:true});assert.equal(f.status,422);assert.match(f.body.error,/COMPOSITION_SOURCE_SHA_MISMATCH/);
});
