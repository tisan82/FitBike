import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {migrationTransaction} from './deploy-visual-delivery.mjs';
const {PGlite}=await import(process.env.PGLITE_MODULE??'@electric-sql/pglite');
const sql=readFileSync(new URL('../../supabase/migrations/20261012073342_unified_authoring_no_inspection_chunks.sql',import.meta.url),'utf8');
const children=JSON.parse(readFileSync(new URL('./fixtures/authoring-children.json',import.meta.url),'utf8'));
const columns=JSON.parse(readFileSync(new URL('./fixtures/authoring-columns.json',import.meta.url),'utf8'));
async function database(){
 const db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema extensions;create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);create table public.content_pipeline_visual_delivery_event(event_id uuid);create table public."12_content"(content_id bigint,content_key text,is_active boolean,published_at timestamptz);
 create function extensions.digest(bytea,text) returns bytea language sql immutable as $$select decode(md5(encode($1,'hex'))||md5(encode($1,'hex')),'hex')$$;
 create function extensions.gen_random_uuid() returns uuid language sql volatile as $$select gen_random_uuid()$$;`);
 const grouped=new Map();for(const c of columns){if(!grouped.has(c.table_name))grouped.set(c.table_name,[]);const id=['content_topic_id','pipeline_id','pipeline_run_id','pipeline_image_id'].includes(c.column_name)&&c.column_name===({'16_content_topic':'content_topic_id','18_content_pipeline':'pipeline_id','19_content_pipeline_run':'pipeline_run_id','21_content_pipeline_image':'pipeline_image_id'}[c.table_name]);grouped.get(c.table_name).push(`"${c.column_name}" ${c.data_type}${id?' generated always as identity primary key':c.column_default?' default '+c.column_default:''}${c.is_nullable==='NO'&&!id?' not null':''}`);}
 await db.exec([...grouped].map(([t,c])=>`create table public."${t}"(${c.join(',')});`).join('\n')+`create unique index image_key on public."21_content_pipeline_image"(pipeline_id,asset_key);`);
 // Test schema mirrors deployed fields/defaults. Real SQL children, not a mocked sync.
 const pending=[...children];const done=new Set();while(pending.length){const i=pending.findIndex(f=>[...f.definition.matchAll(/public\.(content_pipeline_[a-z0-9_]+)\s*\(/g)].every(m=>m[1]===f.proname||done.has(m[1])||!children.some(x=>x.proname===m[1])));assert.notEqual(i,-1);const [f]=pending.splice(i,1);await db.exec(f.definition);done.add(f.proname);}
 const baselines=[...sql.matchAll(/is distinct from '((?:''|[^'])*)' then raise exception 'AUTHORING_BASELINE_DRIFT'/g)].map(m=>m[1].replaceAll("''","'"));assert.equal(baselines.length,5);await db.exec(baselines.join(';\n'));
 await db.exec(migrationTransaction(sql,{version:'20261012073342',name:'unified_authoring_no_inspection_chunks',followUp:true}));return db;
}
const brief={contract_version:5,image_id:'IMG_01',asset_role:'BODY',user_question:'How to inspect parked motorcycle condition?',visual_objective:'Show parked motorcycle seat',must_show:['parked motorcycle seat'],must_not_show:['moving motorcycle'],evidence_requirement:{level:'NONE'},alt_text_draft:'Parked motorcycle seat'};
async function topic(db,key){await db.query(`insert into public."16_content_topic"(topic_key,topic,content_type,normalized_subject,normalized_action,normalized_scope) values($1,'Fixture','MAINTENANCE','fixture','CHECK','GENERIC')`,[key]);}
async function claim(db,id,target=null){return(await db.query('select public.content_pipeline_claim_authoring_v1($1::uuid,$2::bigint) as r',[id,target])).rows[0].r;}
const packet=c=>({version:1,execution:c.packageExecution,planning:{customer_question:'How to inspect parked motorcycle condition?'},research:{fact_register:[{fact_id:'CF1',claim:'Fixture only',verification:'TEST_FIXTURE'}]},writer:{content_key:c.topicKey,final_title:'Fixture article',image_briefs:[brief]}});
const complete=async(db,c,p)=> (await db.query('select public.content_pipeline_complete_authoring_v1($1,$2,$3::jsonb) as r',[c.pipelineId,c.pipelineRunId,JSON.stringify(p)])).rows[0].r;
test('new unified authoring normalizes image levels before Hash and image sync; replay remains idempotent',async()=>{const db=await database();try{
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261012203358_photo_source_policy.sql',import.meta.url),'utf8'));
 await topic(db,'photo-policy-normalization');const c=await claim(db,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');const p=packet(c);p.writer.image_briefs[0]={...brief,evidence_requirement:{level:'REQUIRED'}};
 await complete(db,c,p);const image=(await db.query('select generation_contract from public."21_content_pipeline_image"')).rows[0];assert.equal(image.generation_contract.evidence_requirement.level,'NONE');
 assert.equal((await complete(db,c,p)).replayed,true);
 }finally{await db.close();}});
test('single authoring run stores context once, performs real V5 sync, and completion replay does not repeat writes',async()=>{const db=await database();try{
 await topic(db,'authoring-one');const c=await claim(db,'11111111-1111-4111-8111-111111111111');const p=packet(c);const r=await complete(db,c,p);assert.equal(r.stage,'DRAFTED');
 const row=(await db.query('select planning_artifact,research_artifact,writer_artifact from public."18_content_pipeline"')).rows[0];assert.deepEqual(row.planning_artifact,{});assert.deepEqual(row.research_artifact,{});assert.deepEqual(row.writer_artifact.authoringContext.research,p.research);
 const image=(await db.query('select generation_contract,generation_contract_hash from public."21_content_pipeline_image"')).rows[0];assert.equal(image.generation_contract.contract_version,5);assert.equal(image.generation_contract_hash.length,64);
 await db.exec(`update public."18_content_pipeline" set stage='VISUAL';`);assert.equal((await complete(db,c,p)).replayed,true);assert.equal((await db.query('select count(*)::int as n from public."21_content_pipeline_image"')).rows[0].n,1);
 await assert.rejects(complete(db,c,{...p,planning:{changed:true}}),/REPLAY_CONFLICT/);
 assert.equal((await db.query('select count(*)::int as n from public."19_content_pipeline_run"')).rows[0].n,1);
 }finally{await db.close();}});
test('claim request replay fences null/changed targets and another intent cannot duplicate active execution',async()=>{const db=await database();try{
 await topic(db,'authoring-two');const id='22222222-2222-4222-8222-222222222222';const c=await claim(db,id);assert.equal((await claim(db,id)).pipelineRunId,c.pipelineRunId);
 await assert.rejects(claim(db,id,c.pipelineId),/TARGET_CONFLICT/);await assert.rejects(claim(db,'33333333-3333-4333-8333-333333333333',c.pipelineId),/EXECUTION_BUSY/);
 }finally{await db.close();}});
test('stale run/package and generic completion bypass cannot change active unified state',async()=>{const db=await database();try{
 await topic(db,'authoring-three');const c=await claim(db,'44444444-4444-4444-8444-444444444444');const p=packet(c);
 await assert.rejects(complete(db,c,{...p,execution:{...p.execution,pipelineRunId:c.pipelineRunId+1}}),/CONTEXT_INVALID/);
 await assert.rejects(db.query(`select public.content_pipeline_complete_stage_v1($1,$2,'WRITING','DRAFTED',$3::jsonb)`,[c.pipelineId,c.pipelineRunId,JSON.stringify(p.writer)]),/CONTEXT_INVALID/);
 await assert.rejects(db.query(`select public.content_pipeline_fail_stage_v1($1,$2,'WRITING','HOLD','wrong run')`,[c.pipelineId,c.pipelineRunId+1]),/RUN_MISMATCH/);
 assert.equal((await db.query('select stage from public."18_content_pipeline"')).rows[0].stage,'WRITING');
 }finally{await db.close();}});
test('failure/resume creates fresh run fence, old failure/completion and generic resume cannot adopt it',async()=>{const db=await database();try{
 await topic(db,'authoring-four');const c=await claim(db,'55555555-5555-4555-8555-555555555555');const p=packet(c);
 await db.query(`select public.content_pipeline_fail_stage_v1($1,$2,'WRITING','HOLD','interrupted')`,[c.pipelineId,c.pipelineRunId]);
 await assert.rejects(db.query('select public.content_pipeline_resume_stage_v1($1)',[c.pipelineId]),/REQUIRES_REQUEST_ID/);
 await assert.rejects(db.query("select public.content_pipeline_resume_stage_v1($1,'WRITING')",[c.pipelineId]),/REQUIRES_REQUEST_ID/);
 const r=await claim(db,'66666666-6666-4666-8666-666666666666',c.pipelineId);assert.notEqual(r.pipelineRunId,c.pipelineRunId);
 await assert.rejects(complete(db,c,p),/RUN_INACTIVE/);await assert.rejects(db.query(`select public.content_pipeline_fail_stage_v1($1,$2,'WRITING','HOLD','late failure')`,[c.pipelineId,c.pipelineRunId]),/RUN_MISMATCH/);
 assert.equal((await complete(db,r,packet(r))).stage,'DRAFTED');
 }finally{await db.close();}});
test('invalid V5 packet rolls back entirely and legacy staged completion remains compatible',async()=>{const db=await database();try{
 await topic(db,'authoring-five');const c=await claim(db,'77777777-7777-4777-8777-777777777777');const p=packet(c);p.writer.image_briefs[0]={...brief,must_show:[]};
 await assert.rejects(complete(db,c,p),/FEASIBILITY/);assert.equal((await db.query('select stage from public."18_content_pipeline"')).rows[0].stage,'WRITING');assert.equal((await db.query('select count(*)::int as n from public."21_content_pipeline_image"')).rows[0].n,0);
 await topic(db,'legacy-compatible');await db.exec(`insert into public."18_content_pipeline"(content_topic_id,topic_key,stage) select content_topic_id,topic_key,'PLANNING' from public."16_content_topic" where topic_key='legacy-compatible';insert into public."19_content_pipeline_run"(pipeline_id,stage) select pipeline_id,'PLANNING' from public."18_content_pipeline" where topic_key='legacy-compatible';`);
 const legacy=(await db.query(`select p.pipeline_id,r.pipeline_run_id from public."18_content_pipeline" p join public."19_content_pipeline_run" r using(pipeline_id) where p.topic_key='legacy-compatible'`)).rows[0];await db.query(`select public.content_pipeline_complete_stage_v1($1,$2,'PLANNING','PLANNED','{"customer_question":"legacy"}')`,[legacy.pipeline_id,legacy.pipeline_run_id]);assert.equal((await db.query(`select stage from public."18_content_pipeline" where topic_key='legacy-compatible'`)).rows[0].stage,'PLANNED');
 }finally{await db.close();}});
test('guarded migration history is exact/idempotent and new RPCs are service-only',async()=>{const db=await database();try{
 await db.exec(migrationTransaction(sql,{version:'20261012073342',name:'unified_authoring_no_inspection_chunks',followUp:true}));assert.equal((await db.query('select count(*)::int as n from supabase_migrations.schema_migrations')).rows[0].n,1);
 assert.equal((await db.query("select has_function_privilege('anon','public.content_pipeline_claim_authoring_v1(uuid,bigint)','execute') as allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('service_role','public.content_pipeline_complete_authoring_v1(bigint,bigint,jsonb)','execute') as allowed")).rows[0].allowed,true);
 await assert.rejects(db.exec(sql),/BASELINE_DRIFT/);
 }finally{await db.close();}});
test('production rollback regression exercises real SQL children without persistent fixture rows',async()=>{const db=await database();try{
 await db.exec(readFileSync(new URL('./authoring-regression.sql',import.meta.url),'utf8'));assert.equal((await db.query('select count(*)::int as n from public."16_content_topic"')).rows[0].n,0);
 }finally{await db.close();}});
