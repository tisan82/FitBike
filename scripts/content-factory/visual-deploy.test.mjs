import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationTransaction, migrationVersion, queryProject, projectRef, verifyConcurrentTaskLocks } from './deploy-visual-delivery.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

test('target migration/history are atomic, exact, replayable and leave old history untouched', async () => {
  const db = await PGlite.create();
  try {
    await db.exec("create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]); insert into supabase_migrations.schema_migrations values('old','legacy',array['legacy SQL']);");
    const sql = "create table public.content_pipeline_visual_delivery_event(id int); create function public.delivery_fixture() returns text language sql as $$select 'pixel'::text$$;";
    await db.exec(migrationTransaction(sql));
    await db.exec(migrationTransaction(sql));
    assert.equal((await db.query('select count(*)::int as n from supabase_migrations.schema_migrations')).rows[0].n, 2);
    assert.equal((await db.query('select statements from supabase_migrations.schema_migrations where version=$1', [migrationVersion])).rows[0].statements[0], sql);
    await assert.rejects(db.exec(migrationTransaction(sql + '\n-- changed')), /VISUAL_MIGRATION_HISTORY_CONFLICT/);
    await db.exec('rollback;');
    assert.equal((await db.query("select statements[1] as s from supabase_migrations.schema_migrations where version='old'")).rows[0].s, 'legacy SQL');
  } finally { await db.close(); }
});

test('scoped Management query preserves SQL and does not expose error payloads', async () => {
  let request;
  await queryProject('FIXTURE', 'begin; select 1; rollback;', async (url, options) => {
    request = { url, options };
    return new Response('[]', { status: 201 });
  });
  assert.equal(request.url, `https://api.supabase.com/v1/projects/${projectRef}/database/query`);
  assert.equal(request.options.redirect, 'error');
  assert.deepEqual(JSON.parse(request.options.body), { query: 'begin; select 1; rollback;' });
  await assert.rejects(queryProject('FIXTURE', 'select 1', async () => new Response('{"message":"private input and URL must remain hidden"}', { status: 403 })), error => {
    assert.match(error.message, /HTTP_403/);
    assert.doesNotMatch(error.message, /private input|URL/);
    return true;
  });
});


test('two-session lock verification requires held marker, skips same Task and admits different Task',async()=>{
 const stages=[];const query=async stage=>{stages.push(stage);if(stage==='CONCURRENT_FIXTURES')return[{pipeline_image_id:2},{pipeline_image_id:1}];if(stage==='CONCURRENT_HELD_SESSION')return new Promise(resolve=>setTimeout(()=>resolve([{pipeline_image_id:2,session_id:100}]),10));if(stage==='CONCURRENT_MARKER')return[{marker_available:false}];if(stage==='CONCURRENT_COMPETING_SESSION')return[{acquired_ids:[1],session_id:101}];};
 assert.equal(await verifyConcurrentTaskLocks(query),true);assert.equal(stages.includes('CONCURRENT_COMPETING_SESSION'),true);
 await assert.rejects(verifyConcurrentTaskLocks(async stage=>stage==='CONCURRENT_COMPETING_SESSION'?[{acquired_ids:[1,2],session_id:101}]:query(stage)),/VISUAL_CONCURRENT_TASK_LOCK_FAILED/);
 for(const holder of [[],[{pipeline_image_id:2}],[{pipeline_image_id:1,session_id:100}]])await assert.rejects(verifyConcurrentTaskLocks(async stage=>stage==='CONCURRENT_HELD_SESSION'?holder:query(stage)),/VISUAL_CONCURRENT_TASK_LOCK_FAILED/);
 await assert.rejects(verifyConcurrentTaskLocks(async stage=>stage==='CONCURRENT_COMPETING_SESSION'?[{acquired_ids:[1]}]:query(stage)),/VISUAL_CONCURRENT_TASK_LOCK_FAILED/);
 assert.equal(await verifyConcurrentTaskLocks(async()=>[]),false);
});
