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

import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE??'@electric-sql/pglite');
test('duplicate return binds variable separately from the real image_id column',async()=>{
 const db=await PGlite.create();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table public."21_content_pipeline_image"(pipeline_image_id bigint,image_id text);
 create table public."27_content_pipeline_source_stage_job"(job_id uuid,pipeline_image_id bigint);
 create table public."29_content_pipeline_visual_claim_request"(pipeline_image_id bigint,worker_key text,request_id uuid);
 create function public.content_pipeline_visual_claim_request_status_v1(text,uuid) returns jsonb language sql as $$select '{"activeClaim":false}'::jsonb$$;`);
 const migration=readFileSync(new URL('../../supabase/migrations/20261013055416_duplicate_source_recovery.sql',import.meta.url),'utf8');
 const fn=migration.match(/create or replace function public\.content_pipeline_return_duplicate_visual_candidate_v1[\s\S]*?\$fn\$;/i)[0];
 await db.exec(fn);await db.exec(readFileSync(new URL('./duplicate-source-binding-fix.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('./duplicate-source-binding-fix.sql',import.meta.url),'utf8'));
 await assert.rejects(db.query("select public.content_pipeline_return_duplicate_visual_candidate_v1('worker','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',null)"),/ACTIVE_VISUAL_CLAIM_REQUIRED/);
 }finally{await db.close();}
});
