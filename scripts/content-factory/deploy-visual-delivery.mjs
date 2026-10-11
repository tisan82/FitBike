import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const projectRef = 'farjyjcvduthawpdjuqe';
export const migrationVersion = '20261011022649';
const migrationName = 'visual_inspection_delivery';
const migrationPath = `supabase/migrations/${migrationVersion}_${migrationName}.sql`;

// The repository has historical migration drift. Apply precisely this release,
// atomically with its true history entry; never repair or replay other versions.
export function migrationTransaction(sql) {
  const literal = value => "'" + value.replaceAll("'", "''") + "'";
  return `begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $fitbike_release$
declare prior text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('fitbike-visual-delivery-release',0));
  select statements into prior from supabase_migrations.schema_migrations where version=${literal(migrationVersion)};
  if found then
    if prior is distinct from array[${literal(sql)}]::text[] then raise exception 'VISUAL_MIGRATION_HISTORY_CONFLICT'; end if;
    if to_regclass('public.content_pipeline_visual_delivery_event') is null then raise exception 'VISUAL_MIGRATION_SCHEMA_MISSING'; end if;
  else
    if to_regclass('public.content_pipeline_visual_delivery_event') is not null then raise exception 'VISUAL_SCHEMA_WITHOUT_HISTORY'; end if;
    execute ${literal(sql)};
    insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(migrationVersion)},${literal(migrationName)},array[${literal(sql)}]);
  end if;
end $fitbike_release$;
commit;`;
}

function cli(stage, args) {
  const result = spawnSync('supabase', [...args, '--log-level', 'error'], { encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  // Do not emit raw CLI replies: errors can include SQL, URLs or credentials.
  if (result.error || result.status !== 0) {
    const diagnostic = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const known = diagnostic.match(/VISUAL_[A-Z_]+|DELIVERY_[A-Z_]+|PIXEL_DELIVERY_[A-Z_]+|VALID_STORED_FIXTURE_REQUIRED|GATED_CLAIM_FAILED|STALE_PIXEL_PASS_ALLOWED|FOREIGN_RECEIPT_ALLOWED|CANDIDATE_CIRCUIT_[A-Z_]+/);
    const category = known?.[0] ?? (/401|Unauthorized|Invalid access token/i.test(diagnostic) ? 'AUTHENTICATION_FAILED' : /403|Forbidden/i.test(diagnostic) ? 'AUTHORIZATION_FAILED' : /timeout|timed out/i.test(diagnostic) ? 'TIMEOUT' : 'CLI_FAILED');
    throw new Error(`${stage}: ${category} (exit=${result.status ?? 'none'})`);
  }
  console.log(`${stage}: PASS`);
}

async function requireCurrentMain() {
  const response = await fetch('https://api.github.com/repos/tisan82/FitBike/git/ref/heads/main', {
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok || (await response.json()).object?.sha !== process.env.GITHUB_SHA) throw new Error('PRODUCTION_HEAD_MOVED_OR_UNREADABLE');
}

export async function deploy() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN: MISSING');
  if (process.env.SUPABASE_PROJECT_REF !== projectRef) throw new Error('SUPABASE_PROJECT_REF: MISSING_OR_WRONG_PROJECT');
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('PRODUCTION_REQUIRES_MAIN');
  await requireCurrentMain();
  const dir = mkdtempSync(join(tmpdir(), 'fitbike-visual-release-'));
  try {
    const file = join(dir, 'migration.sql');
    writeFileSync(file, migrationTransaction(readFileSync(migrationPath, 'utf8')), { mode: 0o600 });
    cli('TARGET_MIGRATION', ['db', 'query', '--project-ref', projectRef, '--file', file]);
    cli('TRANSACTIONAL_REGRESSION', ['db', 'query', '--project-ref', projectRef, '--file', 'scripts/content-factory/visual-delivery-regression.sql']);
    await requireCurrentMain();
    // JWT verification is already disabled in deployed v35. The function retains
    // its existing custom worker authentication; no auth policy change here.
    cli('EDGE_DEPLOY', ['functions', 'deploy', 'content-pipeline-visual-mcp', '--project-ref', projectRef, '--use-api', '--no-verify-jwt']);
    console.log(`RELEASE_COMMIT: ${process.env.GITHUB_SHA}`);
    console.log('SCHEDULED_PIXEL_INSPECTION: NOT_VERIFIED; NATIVE_HANDOFF: NOT_VERIFIED');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
}
