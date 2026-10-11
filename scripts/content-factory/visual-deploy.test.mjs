import test from 'node:test';
import assert from 'node:assert/strict';
import { migrationTransaction, migrationVersion } from './deploy-visual-delivery.mjs';
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
