import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { normalizeInspectionResponse, deliverInspectionResponse, downloadVerifiedCanonical, recoverClaimMutation, deliveryDiagnostic } from '../../supabase/functions/content-pipeline-visual-mcp/inspection-delivery.mjs';
globalThis.crypto ??= webcrypto;
const block = {type:'image',mimeType:'image/png',data:'iVBORw0KGgoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='};

test('direct MCP, content_items and JSON-RPC preserve original image object and advisory', () => {
  for (const response of [{content:[block]}, {content_items:[block]}, {result:{content:[block],structuredContent:{clientPixelDelivery:'UNVERIFIED_REQUIRES_RENDERING'}}}]) {
    const result = normalizeInspectionResponse(response);
    assert.equal(result.images[0], block); assert.equal(result.clientPixelsInspected, 'NOT_REPORTED');
  }
});
test('invalid shape, missing image, invalid binary and conflicting aliases are distinct', () => {
  for (const response of [null,[],{content:{}},{content:'oops'},{result:{content_items:{}}},{content:[block],content_items:[]}]) assert.throws(()=>normalizeInspectionResponse(response), /RESPONSE_SHAPE_INVALID/);
  assert.throws(()=>normalizeInspectionResponse({content:[]}), /IMAGE_BLOCK_MISSING/);
  assert.throws(()=>normalizeInspectionResponse({content:[{...block,data:'not a binary block'}]}), /IMAGE_BLOCK_INVALID/);
  assert.equal(normalizeInspectionResponse({content:[]},{requireImages:false}).images.length,0);
});
test('host output forwarding submits actual image blocks without certifying inspection', async () => {
  const outputs=[]; const result=await deliverInspectionResponse({content:[block]}, item=>outputs.push(item));
  assert.equal(outputs[0],block);assert.equal(result.clientImageOutput,'SUBMITTED');assert.equal(result.clientPixelsInspected,'NOT_REPORTED');
  await assert.rejects(deliverInspectionResponse({content:[block]},()=>{throw Error('host unavailable');}),/CLIENT_PIXEL_RENDER_UNVERIFIED/);
});
test('structured error does not get converted to missing-image success', async () => {
  const result=await deliverInspectionResponse({isError:true,content:[{type:'text',text:'failed'}]},()=>assert.fail());
  assert.equal(result.isError,true);
});
const bytes=Uint8Array.from(Buffer.from('RIFF0000WEBPtestbinary'));
const sha=createHash('sha256').update(bytes).digest('hex');
const access={available:true,expectedSha:sha,expectedBytes:bytes.length,canonicalDownloadUrl:'https://example.supabase.co/storage/v1/object/sign/private/test?token=secret'};
const origin='https://example.supabase.co';
test('fallback binds exact origin, bounded WebP and SHA before returning pixels', async()=>{
  let options;const result=await downloadVerifiedCanonical(access,{expectedOrigin:origin,fetchImpl:async(_url,args)=>{options=args;return new Response(bytes,{headers:{'content-type':'image/webp','content-length':String(bytes.length)}});}});
  assert.equal(result.sha256,sha);assert.deepEqual(result.bytes,bytes);assert.equal(options.redirect,'error');assert.equal(result.clientPixelsInspected,'NOT_REPORTED');
});
test('fallback rejects wrong SHA, oversized stream, unsafe origin, credentials, redirect and truncated content',async()=>{
  for(const change of [{expectedSha:'a'.repeat(64)},{expectedBytes:12},{expectedBytes:bytes.length+1}]) await assert.rejects(downloadVerifiedCanonical({...access,...change},{expectedOrigin:origin,fetchImpl:async()=>new Response(bytes,{headers:{'content-type':'image/webp'}})}),/DOWNLOAD_IDENTITY_MISMATCH/);
  for(const u of ['https://other.example/test','https://user:pass@example.supabase.co/test','http://example.supabase.co/test']) await assert.rejects(downloadVerifiedCanonical({...access,canonicalDownloadUrl:u},{expectedOrigin:origin,fetchImpl:()=>assert.fail()}),/DOWNLOAD_FAILED/);
  await assert.rejects(downloadVerifiedCanonical(access,{expectedOrigin:origin,fetchImpl:async()=>({ok:true,redirected:true,body:{},headers:new Headers()})}),/DOWNLOAD_FAILED/);
});
test('lost mutation response only reads receipt; no implicit replay or new Claim',async()=>{
  let mutations=0,reads=0;
  const result=await recoverClaimMutation(async()=>{mutations++;throw Error('AioRpcError after commit');},async()=>{reads++;return {activeClaim:false,status:'QA_PENDING'};});
  assert.equal(mutations,1);assert.equal(reads,1);assert.equal(result.receipt.status,'QA_PENDING');assert.equal(result.outcome,'READBACK_REQUIRED_BEFORE_REPLAY');
});
test('diagnostics classify transport and redact raw payload and malformed identifiers',()=>{
  const ctx={traceId:'11111111-1111-4111-8111-111111111111',tool:'inspect_visual_source',requestId:'https://example.test?token=secret',jobId:'base64secret',stage:'CLIENT_PARSE',startedAt:Date.now()};
  for(const err of [Error('AioRpcError: https://example.test?token=secret'),Error('STAGING_SECRET_VALUE: secret'),Error('unknown data:image/png;base64,secret')]) {
    const result=deliveryDiagnostic(err,ctx);const output=JSON.stringify(result);
    assert.equal(result.requestId,null);assert.equal(result.jobId,null);assert.doesNotMatch(output,/secret|https:|data:/i);
  }
  assert.equal(deliveryDiagnostic(Error('AioRpcError'),ctx).code,'AIO_RPC_ERROR');
});

test('image magic and base64 padding must match declared MIME',()=>{
 for(const data of ['AAAAAAAAAAAAAAAA','iVBORw0KGgoAAAAAA=','/9j/AAAAAAAAAAAAAAAAAAAA']) assert.throws(()=>normalizeInspectionResponse({content:[{...block,data}]}),/IMAGE_BLOCK_INVALID/);
});
