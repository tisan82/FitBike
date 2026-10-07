import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../../supabase/functions/content-pipeline-visual-mcp/generation.ts', import.meta.url), 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
const context = { URL, Date, JSON, Array, Number, String, Error, sourceUrl: s => { if (new URL(s).protocol !== 'https:') throw Error('UNSAFE'); } };
vm.runInNewContext(ts.transpile(source, {module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}), context);
const claim = {pipelineId:39,pipelineImageId:7823,generationContractHash:'contract'};
const sha = 'a'.repeat(64);
const fixture = () => ({job_id:'11111111-1111-4111-8111-111111111111',pipeline_image_id:7823,contract_hash:'contract',status:'STAGED',spec:{productionMethod:'REFERENCE_BASED_GENERATION',prompt:'The exact original current-task scene prompt.',references:[{sourcePageUrl:'https://manufacturer.org/example',sourceOwner:'Manufacturer',verifiedFacts:['Seated rider and stationary bike.'],pixelsInspected:true,checkedAt:'2026-10-06T01:00:00Z'}],transform:{maxWidth:1200},chatFile:{download_url:'https://private.example/secret',file_id:'private-id'},visualMcpOperation:{workerKey:'worker',requestId:'old-private-request'}},result:{sha256:'b'.repeat(64),generatedInput:{sha256:sha,bucket:'content-pipeline-staging',path:`39/7823/${sha}.webp`}}});
test('recovery preserves exact input identity and separates input/final SHA without secrets or QA claims', () => {
  const j=fixture(), p=context.nativeRecoveryPacket(j,'worker',claim);
  assert.equal(p.spec.prompt,j.spec.prompt);
  assert.equal(JSON.stringify(p.spec.references),JSON.stringify(j.spec.references));
  assert.equal(p.sourceSha256,sha);
  assert.equal(p.canonicalSha256,j.result.sha256);
  assert.equal(p.spec.preflightOnly,true);
  assert.equal(p.qaStatus,'NOT_EVALUATED');
  assert.equal(p.generationCallObservedByServer,false);
  for (const secret of ['download_url','private-id','old-private-request']) assert.ok(!JSON.stringify(p).includes(secret));
});
test('failed, semantically invalid, cross-task/hash/worker and malformed preserved inputs have no recovery packet', () => {
  for (const change of [j=>j.status='FAILED',j=>j.result.semanticValidation={status:'FAIL'},j=>j.pipeline_image_id=1,j=>j.contract_hash='other',j=>j.spec.visualMcpOperation.workerKey='other',j=>j.result.generatedInput.path='wrong',j=>j.result.generatedInput.sha256='invalid',j=>j.spec.references=[],j=>j.spec.references[0].secret='unsafe']) {
    const j=fixture();change(j);assert.equal(context.nativeRecoveryPacket(j,'worker',claim),null);
  }
});

test('recovery instruction follows Producer/Reviewer permissions, never invites Producer QA',()=>{
 const p=context.nativeRecoveryPacket(fixture(),'worker',{...claim,executionRole:'PRODUCER'});
 assert.equal(p.spec.preflightOnly,true);assert.equal(p.executionProtocol.qaRecordingAllowed,false);assert.equal(p.executionProtocol.successStatus,'QA_PENDING');
 assert.equal(p.nextAction,'SCREEN_CURRENT_SCENE_THEN_HANDOFF_VISUAL_REVIEW');
 const r=context.nativeRecoveryPacket(fixture(),'worker',{...claim,executionRole:'REVIEWER'});
 assert.equal(r.spec.preflightOnly,false);assert.equal(r.executionProtocol.nativeGenerationAllowed,false);assert.equal(r.executionProtocol.successStatus,'READY_FOR_UPLOAD');
});

test('full-generation native recovery preserves empty references and stored identity',()=>{
 const job=fixture();job.spec.productionMethod='NATIVE_FULL_GENERATION';job.spec.references=[];
 const packet=context.nativeRecoveryPacket(job,'worker',{...claim,executionRole:'PRODUCER'});
 assert.equal(packet.spec.productionMethod,'NATIVE_FULL_GENERATION');assert.equal(packet.spec.references.length,0);assert.equal(packet.sourceSha256,sha);
});
test('V5 native scene prompt excludes operational identifiers and evidence metadata',()=>{
 const packet=context.nativeGenerationContext(2000,'secret-hash',{contract_version:5,image_id:'IMG_03',asset_role:'BODY',user_question:'User editorial question',visual_objective:'Photograph a stationary motorcycle cockpit.',must_show:['right starter switch'],must_not_show:['people'],evidence_requirement:{level:'NONE'},alt_text_draft:'An editorial ALT',pipeline_id:21});
 assert.match(packet.prompt,/Photograph a stationary motorcycle cockpit/);assert.match(packet.prompt,/right starter switch/);assert.match(packet.prompt,/people/);
 for(const absent of ['2000','secret-hash','IMG_03','BODY','editorial','evidence_requirement','pipeline_id','Claim','QA'])assert.ok(!packet.prompt.includes(absent),absent);
 assert.equal(packet.generationContractHash,'secret-hash');assert.equal(packet.pipelineImageId,2000);
});


test('Reviewer selects actual label targets before recording the immutable finalization QA payload',()=>{
 const protocol=context.visualExecutionProtocol('REVIEWER',true);
 assert.match(protocol.phase1,/choose final annotations\/labels/);assert.match(protocol.phase1,/annotationTargetChecks keyed by exact selected label text/);
 assert.match(protocol.phase2,/identical recorded preStagingQa/);assert.match(protocol.phase2,/do not append label checks after recording/);
});

test('failed native input recovery requires storage proof, is input-only, and never offers Reviewer regeneration',()=>{
 const j=fixture();j.status='FAILED';j.result.generatedInput={...j.result.generatedInput,bytes:200,width:1200,height:800,mime:'image/webp',decode:'PASS',signature:'RIFF/WEBP',persistence:{status:'READ_BACK_VERIFIED'}};
 const packet=context.nativeRecoveryPacket(j,'worker',{...claim,executionRole:'PRODUCER'});assert.equal(packet.kind,'INPUT_ONLY');assert.equal(packet.canonicalSha256,null);assert.equal(packet.nextAction,'RESTAGE_PRESERVED_NATIVE_INPUT');assert.equal(packet.spec.preflightOnly,true);assert.equal(packet.qaStatus,'NOT_EVALUATED');
 assert.equal(context.nativeRecoveryPacket(j,'worker',{...claim,executionRole:'REVIEWER'}),null);
 delete j.result.generatedInput.persistence;assert.equal(context.nativeRecoveryPacket(j,'worker',claim),null);j.result.checkpoint='GENERATED_BINARY_PRESERVED';assert.equal(context.nativeRecoveryPacket(j,'worker',claim).kind,'INPUT_ONLY');j.result.generatedInput.bytes=0;assert.equal(context.nativeRecoveryPacket(j,'worker',claim),null);
});
