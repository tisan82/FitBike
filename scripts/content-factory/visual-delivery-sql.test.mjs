import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { migrationTransaction } from './deploy-visual-delivery.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
// Explicit test dependency; production and application dependencies are unchanged.
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const migration=readFileSync(new URL('../../supabase/migrations/20261011022649_visual_inspection_delivery.sql',import.meta.url),'utf8');
const setup=`
create role anon; create role authenticated; create role service_role;
create table public."21_content_pipeline_image"(pipeline_image_id bigint primary key,generation_contract_hash text,status text,claim_token uuid,claim_expires_at timestamptz,next_eligible_at timestamptz);
create table public."29_content_pipeline_visual_claim_request"(worker_key text,request_id uuid,pipeline_image_id bigint,response jsonb,created_at timestamptz default clock_timestamp(),primary key(worker_key,request_id));
create table public."27_content_pipeline_source_stage_job"(job_id uuid primary key,pipeline_image_id bigint,contract_hash text,status text,result jsonb,spec jsonb);
-- Existing RPC boundaries are deterministic fixtures. These are not Production integration proofs.
create function public.content_pipeline_visual_claim_request_status_v1(text,uuid) returns jsonb language sql as $stub$
 select coalesce((select jsonb_build_object('claim',response,'result',case when coalesce((response->>'testActive')::boolean,true) then 'CLAIMED' else 'CLOSED' end,'activeClaim',coalesce((response->>'testActive')::boolean,true)) from public."29_content_pipeline_visual_claim_request" where worker_key=$1 and request_id=$2),jsonb_build_object('result','NOT_FOUND')) $stub$;
create function public.content_pipeline_claim_visual_stage_v1(text,uuid,text,bigint) returns jsonb language sql as $stub$ select '{}'::jsonb $stub$;
`;
const db=await PGlite.create(); await db.exec(setup);
await db.exec('create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
await db.exec(migrationTransaction(migration));
const followUp=readFileSync(new URL('../../supabase/migrations/20261012012704_simplify_visual_inspection_contract.sql',import.meta.url),'utf8');
// Other production Claim constructors are covered by the real rollback regression;
// this local fixture tests the changed recording function with explicit lease states.
await db.exec(followUp.match(/^CREATE OR REPLACE FUNCTION public\.content_pipeline_record_visual_delivery_v1[\s\S]*?\$function\$;/m)[0]);
const rpc=async(name,...args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;
const record=event=>rpc('content_pipeline_record_visual_delivery_v1','worker',JSON.stringify(event),false);
const sha='a'.repeat(64), job=randomUUID(), hash='contract';
async function seedReceipt(runtime='WORK',candidateSha=sha) {
 const requestId=randomUUID();await db.query('insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,pipeline_image_id,response) values($1,$2,1,$3)',['worker',requestId,JSON.stringify({pipelineImageId:1,generationContractHash:hash,executionRole:'PRODUCER'})]);
 await db.query('insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,contract_hash,status,result,spec) values($1,1,$2,$3,$4,$5) on conflict(job_id) do update set result=excluded.result',[job,hash,'STAGED',JSON.stringify({sha256:candidateSha}),JSON.stringify({visualMcpOperation:{workerKey:'worker'}})]);
 await db.query(`update public."27_content_pipeline_source_stage_job" set spec='{"visualMcpOperation":{"workerKey":"worker"}}'::jsonb where job_id=$1`,[job]);
 return {requestId,jobId:job,runtime,scope:'CANDIDATE',expectedSha:candidateSha,view:'CANONICAL'};
}
await db.query('insert into public."21_content_pipeline_image"(pipeline_image_id,generation_contract_hash,status) values(1,$1,$2)',[hash,'RETRY']);

test('migration ACL and runtime probe health/reset/replay run in actual PostgreSQL engine',async()=>{
 const acl=(await db.query("select has_table_privilege('anon','public.content_pipeline_visual_delivery_event','SELECT') as anon,has_function_privilege('authenticated','public.content_pipeline_record_visual_delivery_v1(text,jsonb,boolean)','EXECUTE') as authenticated")).rows[0];assert.equal(acl.anon,false);assert.equal(acl.authenticated,false);
 const probes=[randomUUID(),randomUUID()];
 for(const probe of probes) {
  await rpc('content_pipeline_record_visual_delivery_v1','worker',JSON.stringify({eventId:probe,probeId:probe,runtime:'WORK',scope:'ENVIRONMENT',stage:'SERVER_IMAGE_BLOCKS',outcome:'PASS',code:'PASS',expectedSha:sha}),true);
  await record({eventId:randomUUID(),probeId:probe,runtime:'WORK',scope:'ENVIRONMENT',stage:'CLIENT_IMAGE_OUTPUT',outcome:'FAIL',code:'CLIENT_PIXEL_RENDER_UNVERIFIED',expectedSha:sha});
 }
 assert.equal((await rpc('content_pipeline_visual_delivery_health_v1','worker','WORK')).state,'OPEN');assert.equal((await rpc('content_pipeline_visual_delivery_health_v1','worker','SCHEDULED')).ready,false);
 const e={eventId:randomUUID(),probeId:probes[1],runtime:'WORK',scope:'ENVIRONMENT',stage:'PIXELS_INSPECTED',outcome:'PASS',code:'PASS',expectedSha:sha,pixelsInspected:true,evidence:'Actual fixture probe pixels inspected and described.'};
 await record(e);assert.equal((await rpc('content_pipeline_visual_delivery_health_v1','worker','WORK')).ready,true);
 await db.query("update public.content_pipeline_visual_delivery_event set created_at=now()-interval '40 minutes' where event_id=$1",[probes[1]]);
 await record(e);await assert.rejects(record({...e,outcome:'FAIL',code:'TRANSPORT_ERROR'}),/IMMUTABLE/);
 await assert.rejects(rpc('content_pipeline_claim_visual_delivery_v1','worker',randomUUID(),'PRODUCER',1,'SCHEDULED'),/PRECHECK_BLOCKED/);
});
test('latest per-view pixel FAIL revokes earlier PASS, and another worker cannot report',async()=>{
 const identity=await seedReceipt();const pass={...identity,eventId:randomUUID(),stage:'PIXELS_INSPECTED',outcome:'PASS',code:'PASS',pixelsInspected:true,pixelQa:'PASS',evidence:'Fixture canonical and mobile actual inspection attestation.'};
 await record(pass);await record({...pass,eventId:randomUUID(),view:'MOBILE390'});
 assert.equal((await rpc('content_pipeline_require_visual_pixel_report_v1','worker',identity.requestId,job,sha,'WORK')).valid,true);
 await record({...pass,eventId:randomUUID(),pixelQa:'FAIL'});
 await assert.rejects(rpc('content_pipeline_require_visual_pixel_report_v1','worker',identity.requestId,job,sha,'WORK'),/CLIENT_PIXEL_INSPECTION_REQUIRED/);
 await assert.rejects(rpc('content_pipeline_record_visual_delivery_v1','other',JSON.stringify({...pass,eventId:randomUUID()}),false),/VISUAL_CLAIM_RECEIPT_REQUIRED/);
 await record({...pass,eventId:randomUUID()});
 assert.equal((await rpc('content_pipeline_require_visual_pixel_report_v1','worker',identity.requestId,job,sha,'WORK')).valid,true);
});
test('three distinct receipts open only same runtime/SHA circuit; new SHA and scheduled runtime stay clear',async()=>{
 let identity;
 for(let n=0;n<3;n++) {identity=await seedReceipt();await record({...identity,eventId:randomUUID(),stage:'CLIENT_IMAGE_OUTPUT',outcome:'FAIL',code:'CLIENT_PIXEL_RENDER_UNVERIFIED'});}
 assert.equal((await rpc('content_pipeline_visual_delivery_backoff_v1','worker',identity.requestId)).candidateCircuit,'OPEN');
 identity=await seedReceipt('SCHEDULED');await record({...identity,eventId:randomUUID(),stage:'CLIENT_IMAGE_OUTPUT',outcome:'FAIL',code:'CLIENT_PIXEL_RENDER_UNVERIFIED'});
 assert.equal((await rpc('content_pipeline_visual_delivery_backoff_v1','worker',identity.requestId)).candidateCircuit,'CLOSED');
 identity=await seedReceipt('WORK','b'.repeat(64));await record({...identity,eventId:randomUUID(),stage:'CLIENT_IMAGE_OUTPUT',outcome:'FAIL',code:'CLIENT_PIXEL_RENDER_UNVERIFIED'});
 assert.equal((await rpc('content_pipeline_visual_delivery_backoff_v1','worker',identity.requestId)).candidateCircuit,'CLOSED');
});
test('new reports require active receipt, exact replay remains valid after close and unknown fields are request errors',async()=>{
 const identity=await seedReceipt();const pass={...identity,eventId:randomUUID(),stage:'PIXELS_INSPECTED',outcome:'PASS',code:'PASS',pixelsInspected:true,pixelQa:'PASS',evidence:'Actual same candidate pixel report for lease closure fixture.'};
 await record(pass);
 await db.query(`update public."29_content_pipeline_visual_claim_request" set response=response||'{"testActive":false}'::jsonb where request_id=$1`,[identity.requestId]);
 await record(pass);await assert.rejects(record({...pass,eventId:randomUUID()}),/VISUAL_CLAIM_RECEIPT_REQUIRED/);
 await assert.rejects(record({...pass,extra:'not part of schema'}),/DELIVERY_REQUEST_INVALID/);
});
test.after(async()=>{await db.close();});
