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
