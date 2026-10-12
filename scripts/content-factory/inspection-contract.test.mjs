import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deliveryEventSchema, validateDeliveryEvent, inspectionRecovery, toolAllowedForRole } from '../../supabase/functions/content-pipeline-visual-mcp/inspection-contract.mjs';
const candidate = () => ({eventId:randomUUID(),requestId:randomUUID(),jobId:randomUUID(),expectedSha:'a'.repeat(64),scope:'CANDIDATE',runtime:'SCHEDULED',view:'CANONICAL',stage:'PIXELS_INSPECTED',outcome:'PASS',code:'PASS',pixelsInspected:true,pixelQa:'PASS',evidence:'Actual passenger seat and fixed rear luggage rack inspected.'});
test('request schema and validation reject extra fields, wrong values and missing inspection proof',()=>{
 assert.equal(deliveryEventSchema.additionalProperties,false);
 assert.equal(validateDeliveryEvent(candidate()).scope,'CANDIDATE');
 for(const patch of [{generationContractHash:'do not pass derived identity'},{eventId:'bad'},{expectedSha:'bad'},{view:'PROBE'},{runtime:'OTHER'},{pixelsInspected:false},{pixelQa:null},{evidence:'https://secret.invalid/private'},{outcome:'FAIL'}]) assert.throws(()=>validateDeliveryEvent({...candidate(),...patch}),e=>e.code==='DELIVERY_REQUEST_INVALID');
 assert.throws(()=>validateDeliveryEvent({...candidate(),scope:'ENVIRONMENT',view:'PROBE'}),e=>e.field==='probeId');
});
test('recovery uses latest same-receipt per-view observations and never inherits prior Claim PASS',()=>{
 const current={requestId:randomUUID(),executionRole:'PRODUCER',activeClaim:true,claim:{deliveryRuntime:'SCHEDULED',generationContract:{asset_role:'THUMBNAIL_HERO'}}};
 const pass=view=>({event_id:randomUUID(),view_name:view,stage:'PIXELS_INSPECTED',outcome:'PASS',pixels_inspected:true,pixel_qa:'PASS'});
 let x=inspectionRecovery(current,randomUUID(),'a'.repeat(64),['CANONICAL','MOBILE390','CARD','HERO'].map(pass));assert.equal(x.nextAction,'HANDOFF_VISUAL_REVIEW');
 x=inspectionRecovery(current,randomUUID(),'a'.repeat(64),[{...pass('CANONICAL'),pixel_qa:'FAIL'},pass('CANONICAL')]);assert.equal(x.views[0].pixelQa,'NOT_PASSED');assert.equal(x.nextAction,'INSPECT_MISSING_VIEWS');
 x=inspectionRecovery({...current,activeClaim:false,nextAction:'RECLAIM_OWN_ROLE_BEFORE_WRITE'},randomUUID(),'a'.repeat(64),[]);assert.equal(x.nextAction,'RECLAIM_OWN_ROLE_BEFORE_WRITE');assert.equal(x.previousClaimPixelsReusable,false);assert.equal(x.regenerate,false);
});
test('role exposure retains shared inspection but separates generation and approval',()=>{
 assert.equal(toolAllowedForRole('open_visual_file_upload','REVIEWER'),false);assert.equal(toolAllowedForRole('dispatch_visual_generation','REVIEWER'),true);assert.equal(toolAllowedForRole('reject_visual_source','PRODUCER'),true);assert.equal(toolAllowedForRole('approve_visual_source','PRODUCER'),false);
 assert.equal(toolAllowedForRole('record_visual_pixel_inspection','PRODUCER'),true);assert.equal(toolAllowedForRole('record_visual_pixel_inspection','REVIEWER'),true);
 assert.equal(toolAllowedForRole('claim_visual_image','PRODUCER'),false);
});
