import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryDiagnostic} from '../../supabase/functions/content-pipeline-visual-mcp/inspection-delivery.mjs';
test('duplicate policy failure is not a transport failure or attempted dispatch',()=>{
 const result=deliveryDiagnostic(Error('DUPLICATE_SOURCE_PREFLIGHT: private source URL omitted'),{tool:'dispatch_visual_source',stage:'SOURCE_USAGE_CHECK',startedAt:Date.now()});
 assert.equal(result.code,'DUPLICATE_SOURCE_PREFLIGHT');
 assert.equal(result.mutationOutcome,'NOT_ATTEMPTED');
 assert.doesNotMatch(JSON.stringify(result),/private source/);
});
test('role and state failures retain their own safe error codes',()=>{
 for(const code of ['ACTIVE_VISUAL_CLAIM_REQUIRED','REVIEW_SAME_SOURCE_REQUIRED','PRE_STAGING_VISUAL_QA_REQUIRED','SOURCE_USAGE_READ_FAILED']){
  assert.equal(deliveryDiagnostic(Error(code),{stage:'SERVER_REQUEST',startedAt:Date.now()}).code,code);
 }
 assert.equal(deliveryDiagnostic(Error('AioRpcError: connection lost'),{startedAt:Date.now()}).code,'AIO_RPC_ERROR');
});

