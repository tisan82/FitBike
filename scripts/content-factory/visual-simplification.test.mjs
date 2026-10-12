import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { migrationTransaction } from './deploy-visual-delivery.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const sql=readFileSync(new URL('../../supabase/migrations/20261012012704_simplify_visual_inspection_contract.sql',import.meta.url),'utf8');
test('full guarded migration compiles against baseline, preserves columns/history and hydrates compact receipts',async()=>{
 const db=await PGlite.create();try {
  const csv=readFileSync(new URL('../../docs/tasks/pipeline-simplification/DB_COLUMNS.csv',import.meta.url),'utf8');const tables=new Map();
  for(const line of csv.trim().split('\n').slice(1)){const [table,column,type]=line.split(',');if(!tables.has(table))tables.set(table,[]);tables.get(table).push(`"${column}" ${type}`);}
  await db.exec([...tables].map(([table,columns])=>`create table public."${table}"(${columns.join(',')});`).join('\n'));
  await db.exec('create schema extensions; create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
  const baselines=[...sql.matchAll(/is distinct from '((?:''|[^'])*)' then raise exception 'VISUAL_SIMPLIFICATION_BASELINE_DRIFT'/g)].map(m=>m[1].replaceAll("''","'"));assert.equal(baselines.length,6);
  await db.exec(baselines.join(';\n'));
  const transaction=migrationTransaction(sql,{version:'20261012012704',name:'simplify_visual_inspection_contract',followUp:true});
  await db.exec(transaction);await db.exec(transaction);
  assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_schema='public'")).rows[0].n,264);
  assert.equal((await db.query("select count(*)::int as n from supabase_migrations.schema_migrations")).rows[0].n,1);
  // Child policy/recovery RPCs are narrow fixtures; production rollback tests
  // verify real child implementations and transaction/ownership semantics.
  await db.exec(`create function public.content_pipeline_visual_contract_policy_v1(jsonb) returns jsonb language sql as $$select '{"peoplePolicy":"OPTIONAL"}'::jsonb$$;
   create function public.content_pipeline_visual_review_requirements_v1(jsonb) returns jsonb language sql as $$select '{"mobileRule":"390px"}'::jsonb$$;
   create function public.content_pipeline_review_candidate_v1(bigint,uuid) returns jsonb language sql as $$select null::jsonb$$;
   create function public.content_pipeline_owned_visual_candidate_v1(text,bigint) returns jsonb language sql as $$select null::jsonb$$;
   create function public.content_pipeline_owned_visual_recovery_v1(text,bigint) returns jsonb language sql as $$select null::jsonb$$;
   create function public.content_pipeline_owned_native_input_v1(text,bigint) returns jsonb language sql as $$select null::jsonb$$;
   insert into public."21_content_pipeline_image"(pipeline_image_id,status,visual_phase) values(1,'PENDING','PRODUCTION_PENDING');
   insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,pipeline_image_id,response,created_at) values('worker','11111111-1111-4111-8111-111111111111',1,'{"executionRole":"PRODUCER","generationContractHash":"frozen-hash","generationContract":{"contract_version":5,"must_show":["motorcycle seat"]}}'::jsonb,now());`);
  const result=(await db.query("select public.content_pipeline_visual_claim_request_status_v1('worker','11111111-1111-4111-8111-111111111111') as r")).rows[0].r;
  assert.equal(result.claim.generationContractHash,'frozen-hash');assert.equal(result.claim.nativeGenerationContext.subject,'motorcycle seat');assert.equal(result.claim.runtimePolicy.peoplePolicy,'OPTIONAL');
  const stored=(await db.query('select response from public."29_content_pipeline_visual_claim_request"')).rows[0].response;assert.equal(stored.nativeGenerationContext,undefined);assert.equal(stored.runtimePolicy,undefined);
  await assert.rejects(db.exec(sql),/VISUAL_SIMPLIFICATION_BASELINE_DRIFT/);
 }finally{await db.close();}
});
