import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE??'@electric-sql/pglite');
const release=readFileSync(new URL('./candidate-qa-gate.sql',import.meta.url),'utf8');
const baseline=JSON.parse(readFileSync(new URL('./fixtures/candidate-gate-baseline.json',import.meta.url),'utf8'));
test('unknown environment can Claim; only exact latest candidate reports satisfy QA; release is idempotent and drift fenced',async()=>{
 const db=await PGlite.create();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table public."21_content_pipeline_image"(pipeline_image_id bigint primary key,pipeline_id bigint,generation_contract_hash text,status text,claim_token uuid,claim_expires_at timestamptz,next_eligible_at timestamptz);
 create table public."29_content_pipeline_visual_claim_request"(worker_key text,request_id uuid,pipeline_image_id bigint,response jsonb,created_at timestamptz default now(),primary key(worker_key,request_id));
 create table public."27_content_pipeline_source_stage_job"(job_id uuid primary key,pipeline_image_id bigint,contract_hash text,status text,result jsonb,spec jsonb,approved_at timestamptz);
 create table public."23_content_pipeline_image_run"(pipeline_image_run_id bigint);
 create function public.content_pipeline_visual_claim_request_status_v1(text,uuid) returns jsonb language sql as $$select coalesce((select jsonb_build_object('claim',response,'activeClaim',true) from public."29_content_pipeline_visual_claim_request" where worker_key=$1 and request_id=$2),'{}'::jsonb)$$;
 create function public.content_pipeline_claim_visual_stage_v1(text,uuid,text,bigint) returns jsonb language plpgsql as $$begin insert into public."29_content_pipeline_visual_claim_request" values($1,$2,$4,jsonb_build_object('pipelineImageId',$4,'generationContractHash','hash','executionRole',$3),now()) on conflict do nothing;return public.content_pipeline_visual_claim_request_status_v1($1,$2);end$$;`);
 const base=readFileSync(new URL('../../supabase/migrations/20261011022649_visual_inspection_delivery.sql',import.meta.url),'utf8');await db.exec(base);
 for(const row of baseline)await db.exec(row.definition+';');
 await db.exec(release);await db.exec(release);
 const worker='test-worker',req=randomUUID(),job=randomUUID(),sha='a'.repeat(64);
 await db.query(`insert into public."21_content_pipeline_image"(pipeline_image_id,generation_contract_hash) values(1,'hash');`);
 const claim=(await db.query('select public.content_pipeline_claim_visual_delivery_v1($1,$2,\'PRODUCER\',1,\'SCHEDULED\') r',[worker,req])).rows[0].r;
 assert.equal(claim.activeClaim,true);assert.equal(claim.claim.deliveryRuntime,'SCHEDULED');assert.equal(claim.claim.environmentObservation.ready,false);assert.equal(claim.claim.environmentProbeRequired,false);
 await assert.rejects(db.query('select public.content_pipeline_claim_visual_delivery_v1($1,$2,\'PRODUCER\',1,\'CHAT\')',[worker,req]),/VISUAL_REQUEST_INPUT_CONFLICT/);
 await db.query(`insert into public."27_content_pipeline_source_stage_job" values($1,1,'hash','STAGED',$2,$3,null)`,[job,JSON.stringify({sha256:sha}),JSON.stringify({visualMcpOperation:{workerKey:worker}})]);
 const require=()=>db.query('select public.content_pipeline_require_visual_pixel_report_v1($1,$2,$3,$4,\'SCHEDULED\')',[worker,req,job,sha]);
 await assert.rejects(require(),/CLIENT_PIXEL_INSPECTION_REQUIRED/);
 const record=(view,pixelQa='PASS')=>db.query('select public.content_pipeline_record_visual_delivery_v1($1,$2,false)',[worker,JSON.stringify({eventId:randomUUID(),requestId:req,jobId:job,runtime:'SCHEDULED',scope:'CANDIDATE',stage:'PIXELS_INSPECTED',outcome:'PASS',code:'PASS',view,expectedSha:sha,pixelsInspected:true,pixelQa,evidence:'Rollback-only protocol fixture observation, not scheduled runtime proof.'})]);
 await record('CANONICAL');await assert.rejects(require(),/CLIENT_PIXEL_INSPECTION_REQUIRED/);await record('MOBILE390');await require();
 await assert.rejects(db.query('select public.content_pipeline_require_visual_pixel_report_v1($1,$2,$3,$4,\'SCHEDULED\')',[worker,randomUUID(),job,sha]),/CLIENT_PIXEL_INSPECTION_REQUIRED/);
 await record('CANONICAL','FAIL');await assert.rejects(require(),/CLIENT_PIXEL_INSPECTION_REQUIRED/);
 await record('CANONICAL');await require();
 const handoff=baseline.find(x=>x.proname==='content_pipeline_handoff_visual_review_v1');
 assert.match(release,/CANDIDATE_QA_GATE_V2/);assert.match(release,/serialize observations/);
 await db.exec(handoff.definition.replace('declare r','-- Unrelated later change\ndeclare r')+';');
 await assert.rejects(db.exec(release),/QA_GATE_DEFINITION_DRIFT/);
 }finally{await db.close();}
});
