import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const projectRef = 'farjyjcvduthawpdjuqe';
export const migrationVersion = '20261011022649';
const migrationName = 'visual_inspection_delivery';
const migrationPath = `supabase/migrations/${migrationVersion}_${migrationName}.sql`;

// The repository has historical migration drift. Apply precisely this release,
// atomically with its true history entry; never repair or replay other versions.
export function migrationTransaction(sql, options = {}) {
  const version = options.version ?? migrationVersion;
  const name = options.name ?? migrationName;
  const literal = value => "'" + value.replaceAll("'", "''") + "'";
  return `begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $fitbike_release$
declare prior text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('fitbike-visual-delivery-release',0));
  select statements into prior from supabase_migrations.schema_migrations where version=${literal(version)};
  if found then
    if prior is distinct from array[${literal(sql)}]::text[] then raise exception 'VISUAL_MIGRATION_HISTORY_CONFLICT'; end if;
    if to_regclass('public.content_pipeline_visual_delivery_event') is null then raise exception 'VISUAL_MIGRATION_SCHEMA_MISSING'; end if;
  else
    if ${options.followUp ? "to_regclass('public.content_pipeline_visual_delivery_event') is null" : "to_regclass('public.content_pipeline_visual_delivery_event') is not null"} then raise exception '${options.followUp ? 'VISUAL_BASE_SCHEMA_MISSING' : 'VISUAL_SCHEMA_WITHOUT_HISTORY'}'; end if;
    execute ${literal(sql)};
    insert into supabase_migrations.schema_migrations(version,name,statements) values(${literal(version)},${literal(name)},array[${literal(sql)}]);
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
    const categories = [
      [/401|Unauthorized|Invalid access token|invalid token format/i, 'AUTHENTICATION_FAILED'],
      [/403|Forbidden|permission denied/i, 'AUTHORIZATION_FAILED'],
      [/timeout|timed out/i, 'TIMEOUT'],
      [/config.toml|supabase init|project ref.*link/i, 'CLI_CONFIG_REQUIRED'],
      [/unknown flag|unknown command|unexpected argument/i, 'CLI_ARGUMENT_INVALID'],
      [/SQLSTATE.?42601|syntax error/i, 'SQL_SYNTAX_ERROR'],
      [/SQLSTATE.?42703|column.*does not exist/i, 'SQL_COLUMN_MISSING'],
      [/SQLSTATE.?42P01|relation.*does not exist/i, 'SQL_RELATION_MISSING'],
      [/SQLSTATE.?42883|function.*does not exist/i, 'SQL_FUNCTION_MISSING'],
      [/SQLSTATE.?23505|duplicate key|already exists/i, 'SQL_OBJECT_CONFLICT'],
      [/429|rate limit/i, 'RATE_LIMITED'],
      [/unmarshal|decode.*response|unexpected.*response/i, 'CLI_RESPONSE_INVALID'],
      [/read.only|read-only|readonly/i, 'QUERY_READ_ONLY'],
    ];
    const category = known?.[0] ?? categories.find(([pattern]) => pattern.test(diagnostic))?.[1] ?? 'CLI_FAILED';
    throw new Error(`${stage}: ${category} (exit=${result.status ?? 'none'}, stdoutBytes=${Buffer.byteLength(result.stdout ?? '')}, stderrBytes=${Buffer.byteLength(result.stderr ?? '')})`);
  }
  console.log(`${stage}: PASS`);
}

export async function queryProject(stage, sql, fetcher = fetch) {
  // The CLI's linked-query preflight resolves an unused TCP database connection.
  // Use the same documented Management API endpoint directly for scoped SQL.
  // CLI remains responsible for Edge bundling/deployment.
  const response = await fetcher(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90000),
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!response.ok) {
    const body = await response.text();
    const known = body.match(/VISUAL_[A-Z_]+|DELIVERY_[A-Z_]+|PIXEL_DELIVERY_[A-Z_]+|VALID_STORED_FIXTURE_REQUIRED|GATED_CLAIM_FAILED|STALE_PIXEL_PASS_ALLOWED|FOREIGN_RECEIPT_ALLOWED|CANDIDATE_CIRCUIT_[A-Z_]+/);
    const sqlState = body.match(/SQLSTATE[^A-Z0-9]*([0-9A-Z]{5})/i)?.[1];
    // Emit codes/metrics only; API errors can contain SQL and sensitive values.
    throw new Error(`${stage}: HTTP_${response.status}${known ? ':' + known[0] : ''}${sqlState ? ':SQLSTATE_' + sqlState : ''} (responseBytes=${Buffer.byteLength(body)})`);
  }
  await response.arrayBuffer();
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
    await queryProject('TARGET_MIGRATION', migrationTransaction(readFileSync(migrationPath, 'utf8')));
    await queryProject('SIMPLIFICATION_MIGRATION', migrationTransaction(readFileSync('supabase/migrations/20261012012704_simplify_visual_inspection_contract.sql', 'utf8'), {version:'20261012012704',name:'simplify_visual_inspection_contract',followUp:true}));
    await queryProject('TRANSACTIONAL_REGRESSION', readFileSync('scripts/content-factory/visual-delivery-regression.sql', 'utf8'));
    await requireCurrentMain();
    // JWT verification is already disabled in deployed v35. The function retains
    // its existing custom worker authentication; no auth policy change here.
    cli('EDGE_DEPLOY', ['functions', 'deploy', 'content-pipeline-visual-mcp', '--project-ref', projectRef, '--use-api', '--no-verify-jwt']);
    console.log(`RELEASE_COMMIT: ${process.env.GITHUB_SHA}`);
    console.log('SCHEDULED_PIXEL_INSPECTION: NOT_VERIFIED; NATIVE_HANDOFF: NOT_VERIFIED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
}
