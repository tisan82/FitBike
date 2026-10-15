import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_MODULE??'@electric-sql/pglite');
const sql=readFileSync(new URL('./schema-prototype.sql',import.meta.url),'utf8');
const hash='a'.repeat(64);
async function database(){
 const db=await PGlite.create();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table public."18_content_pipeline"(pipeline_id bigint primary key);
 create table public."19_content_pipeline_run"(pipeline_run_id bigint primary key,pipeline_id bigint,metadata jsonb);
 create table public."21_content_pipeline_image"(pipeline_image_id bigint primary key,pipeline_id bigint,image_id text,generation_contract_hash text);
 insert into public."18_content_pipeline" values(1),(2);
 insert into public."19_content_pipeline_run" values(11,1,'{"executionMode":"AUTHORING_V1"}'),(22,2,'{"executionMode":"AUTHORING_V1"}'),(33,1,'{}');
 insert into public."21_content_pipeline_image" values(101,1,'IMG_01','${hash}'),(202,2,'IMG_01','${hash}');
 grant select on public."18_content_pipeline",public."19_content_pipeline_run",public."21_content_pipeline_image" to service_role;`);
 await db.exec(sql);return db;
}
async function supply(db,overrides={}){
 const id=crypto.randomUUID();
 const r={supply_id:id,pipeline_id:1,authoring_run_id:11,image_id:'IMG_01',contract_hash:hash,
 operation_id:crypto.randomUUID(),intent_hash:'b'.repeat(64),source_role:'PRODUCTION_INPUT',
 source_kind:'REAL_SOURCE',production_path:'SERVER_TRANSFORM',source_page_url:'https://manufacturer.org/bike',
 source_asset_url:'https://manufacturer.org/bike.jpg',source_owner:'Manufacturer',...overrides};
 const keys=Object.keys(r);
 await db.query(`insert into public.content_pipeline_visual_supply(${keys.join(',')}) values(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(r));return r;
}
async function stored(db,row){
 const path=`authoring-supply/${row.pipeline_id}/${row.authoring_run_id}/${row.supply_id}/${hash}.jpg`;
 await db.query(`update public.content_pipeline_visual_supply set lifecycle='STORED',original_bucket='content-pipeline-native-handoff',
 original_path=$2,original_sha256=$3,original_mime='image/jpeg',original_bytes=100000,original_width=1600,original_height=1000,
 technical_verified_at=now(),source_inspected_at=now(),source_evidence='Actual parked motorcycle and wheel visible in source pixels.' where supply_id=$1`,[row.supply_id,path,hash]);
}
async function bind(db,row,task=101,selected=true){await db.query(`update public.content_pipeline_visual_supply set lifecycle='BOUND',pipeline_image_id=$2,bound_at=now(),is_selected=$3 where supply_id=$1`,[row.supply_id,task,selected]);}
async function ready(db,task=101){return(await db.query('select public.content_pipeline_source_supply_ready_v1($1) as ready',[task])).rows[0].ready;}
const scenario=(name,fn)=>test(name,async()=>{const db=await database();try{await fn(db);}finally{await db.close();}});
scenario('URL-only candidate is not stored or eligible; NULL proof cannot pass check',async db=>{
 const r=await supply(db);assert.equal(await ready(db),false);
 await assert.rejects(db.query(`update public.content_pipeline_visual_supply set lifecycle='STORED' where supply_id=$1`,[r.supply_id]),/supply_verified_storage/);
 assert.equal((await db.query('select lifecycle from public.content_pipeline_visual_supply')).rows[0].lifecycle,'PREPARED');
});
scenario('stored original stays provisional until exact Task binding',async db=>{
 const r=await supply(db);await stored(db,r);assert.equal(await ready(db),false);await bind(db,r);assert.equal(await ready(db),true);
 assert.equal((await db.query(`select source_supply_policy from public."21_content_pipeline_image" where pipeline_image_id=101`)).rows[0].source_supply_policy,'LEGACY');
});
scenario('reference-only file cannot be selected as production input',async db=>{
 const r=await supply(db,{source_role:'REFERENCE_ONLY',production_path:'REFERENCE_ONLY'});await stored(db,r);await bind(db,r,101,false);
 assert.equal(await ready(db),false);
 await assert.rejects(db.query('update public.content_pipeline_visual_supply set is_selected=true where supply_id=$1',[r.supply_id]),/supply_role_path|supply_selected_bound/);
});
scenario('source that still needs Native editing is not scheduled production-ready',async db=>{
 const r=await supply(db,{production_path:'NATIVE_EDIT_REQUIRED'});await stored(db,r);await bind(db,r);assert.equal(await ready(db),false);
});
scenario('wrong authoring run or non-authoring run cannot own supply',async db=>{
 await assert.rejects(supply(db,{authoring_run_id:22}),/SUPPLY_AUTHORING_RUN_MISMATCH/);
 await assert.rejects(supply(db,{authoring_run_id:33}),/SUPPLY_AUTHORING_RUN_MISMATCH/);
});
scenario('wrong Task or provisional Contract Hash cannot bind',async db=>{
 const r=await supply(db);await stored(db,r);await assert.rejects(bind(db,r,202),/SUPPLY_TASK_CONTRACT_MISMATCH/);
 const stale=await supply(db,{contract_hash:'c'.repeat(64)});await stored(db,stale);await assert.rejects(bind(db,stale),/SUPPLY_TASK_CONTRACT_MISMATCH/);
});
scenario('Contract edits invalidate readiness without silently rewriting original supply',async db=>{
 const r=await supply(db);await stored(db,r);await bind(db,r);assert.equal(await ready(db),true);
 await db.query(`update public."21_content_pipeline_image" set generation_contract_hash=$1 where pipeline_image_id=101`,['c'.repeat(64)]);
 assert.equal(await ready(db),false);
});
scenario('old-hash supply can retire and release primary slot for current-hash supply',async db=>{
 const r=await supply(db);await stored(db,r);await bind(db,r);
 const nextHash='c'.repeat(64);
 await db.query(`update public."21_content_pipeline_image" set generation_contract_hash=$1 where pipeline_image_id=101`,[nextHash]);
 await db.query(`update public.content_pipeline_visual_supply set lifecycle='SUPERSEDED',is_selected=false where supply_id=$1`,[r.supply_id]);
 const next=await supply(db,{contract_hash:nextHash});await stored(db,next);await bind(db,next);
 assert.equal(await ready(db),true);
 const old=(await db.query('select original_sha256,lifecycle from public.content_pipeline_visual_supply where supply_id=$1',[r.supply_id])).rows[0];
 assert.equal(old.original_sha256,hash);assert.equal(old.lifecycle,'SUPERSEDED');
 await assert.rejects(db.query(`update public.content_pipeline_visual_supply set lifecycle='BOUND',is_selected=true where supply_id=$1`,[r.supply_id]),/SUPPLY_TASK_CONTRACT_MISMATCH/);
});
scenario('persisted source SHA/path/provenance and operation intent are immutable',async db=>{
 const r=await supply(db);await stored(db,r);
 await assert.rejects(db.query('update public.content_pipeline_visual_supply set original_sha256=$2 where supply_id=$1',[r.supply_id,'c'.repeat(64)]),/SUPPLY_PERSISTED_IDENTITY_IMMUTABLE/);
 await assert.rejects(db.query('update public.content_pipeline_visual_supply set source_owner=$2 where supply_id=$1',[r.supply_id,'Different owner']),/SUPPLY_PERSISTED_IDENTITY_IMMUTABLE/);
 await assert.rejects(db.query('update public.content_pipeline_visual_supply set intent_hash=$2 where supply_id=$1',[r.supply_id,'c'.repeat(64)]),/SUPPLY_INTENT_IMMUTABLE/);
});
scenario('one operation receipt and one primary bound input per Task',async db=>{
 const r=await supply(db);await assert.rejects(supply(db,{operation_id:r.operation_id}),/unique/);
 await stored(db,r);await bind(db,r);const other=await supply(db);await stored(db,other);
 await assert.rejects(bind(db,other),/supply_one_selected_input/);
});
scenario('semantic rejection stops repeated consumption and retains proof',async db=>{
 const r=await supply(db);await stored(db,r);await bind(db,r);
 await db.query(`update public.content_pipeline_visual_supply set lifecycle='REJECTED',is_selected=false,last_error_code='SEMANTIC_QA' where supply_id=$1`,[r.supply_id]);
 assert.equal(await ready(db),false);assert.equal((await db.query('select original_sha256 from public.content_pipeline_visual_supply')).rows[0].original_sha256,hash);
});
scenario('Native output requires native provenance and cannot be labelled real source',async db=>{
 await assert.rejects(supply(db,{production_path:'STORED_NATIVE_OUTPUT'}),/supply_kind_path/);
 const r=await supply(db,{source_kind:'CHATGPT_NATIVE',production_path:'STORED_NATIVE_OUTPUT'});
 await assert.rejects(stored(db,r),/supply_verified_storage/);
});
scenario('RLS and privileges expose neither supply data nor readiness to public roles',async db=>{
 const row=(await db.query(`select relrowsecurity from pg_class where oid='public.content_pipeline_visual_supply'::regclass`)).rows[0];assert.equal(row.relrowsecurity,true);
 for(const role of ['anon','authenticated']){
  assert.equal((await db.query(`select has_table_privilege($1,'public.content_pipeline_visual_supply','SELECT') as allowed`,[role])).rows[0].allowed,false);
  assert.equal((await db.query(`select has_function_privilege($1,'public.content_pipeline_source_supply_ready_v1(bigint)','EXECUTE') as allowed`,[role])).rows[0].allowed,false);
 }
 assert.equal((await db.query(`select has_function_privilege('service_role','public.content_pipeline_source_supply_ready_v1(bigint)','EXECUTE') as allowed`)).rows[0].allowed,true);
});
