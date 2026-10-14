import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
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
    const known = body.match(/DUPLICATE_[A-Z_]+|NORMAL_[A-Z_]+|SOURCE_[A-Z_]+|REVIEW_[A-Z_]+|SEMANTIC_[A-Z_]+|APPROVED_[A-Z_]+|AUTHORING_[A-Z_]+|VISUAL_[A-Z_]+|DELIVERY_[A-Z_]+|PIXEL_DELIVERY_[A-Z_]+|VALID_STORED_FIXTURE_REQUIRED|GATED_CLAIM_FAILED|STALE_PIXEL_PASS_ALLOWED|FOREIGN_RECEIPT_ALLOWED|CANDIDATE_CIRCUIT_[A-Z_]+/);
    const sqlState = body.match(/(?:SQLSTATE[^A-Z0-9]*|ERROR:\s*)([0-9A-Z]{5})/i)?.[1];
    // Emit codes/metrics only; API errors can contain SQL and sensitive values.
    throw new Error(`${stage}: HTTP_${response.status}${known ? ':' + known[0] : ''}${sqlState ? ':SQLSTATE_' + sqlState : ''} (responseBytes=${Buffer.byteLength(body)})`);
  }
  const rows = await response.json();
  console.log(`${stage}: PASS`);
  return rows;
}

// Short rollback-equivalent SELECT transactions: no Claim/data mutation, no
// asset/Storage access. Confirms actual separate sessions, not only a SQL scan.
export async function verifyConcurrentTaskLocks(query = queryProject) {
  const fixtures = await query('CONCURRENT_FIXTURES', `select pipeline_image_id from public."21_content_pipeline_image" where status in ('PENDING','RETRY') and (claim_token is null or claim_expires_at<now()) order by pipeline_image_id desc limit 2`);
  const ids = Array.isArray(fixtures) ? fixtures.map(row=>Number(row.pipeline_image_id)) : [];
  if (ids.length !== 2 || ids.some(id=>!Number.isSafeInteger(id)||id<1)) { console.log('CONCURRENT_TASK_LOCKS: NOT_VERIFIED_NO_IDLE_FIXTURES'); return false; }
  const marker = randomInt(1000000000000,2000000000000);
  const held = query('CONCURRENT_HELD_SESSION', `with locked as materialized(select pipeline_image_id from public."21_content_pipeline_image" where pipeline_image_id=${ids[0]} and status in ('PENDING','RETRY') and (claim_token is null or claim_expires_at<now()) for update skip locked), signal as materialized(select pg_advisory_xact_lock(${marker}::bigint) from locked), pause as materialized(select pg_sleep(5) from signal) select pipeline_image_id,pg_backend_pid() as session_id from locked cross join pause`);
  // Attach promptly: a failed first request must never become an unhandled rejection.
  let holdError; const completion=held.catch(error=>{holdError=error;return [];});
  let confirmed=false, competing;
  try {
    for(let n=0;n<8;n++) {
      const rows=await query('CONCURRENT_MARKER', `select pg_try_advisory_xact_lock(${marker}::bigint) as marker_available`);
      if(rows?.[0]?.marker_available===false){confirmed=true;break;}
      if(holdError)throw holdError;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!confirmed){console.log('CONCURRENT_TASK_LOCKS: NOT_VERIFIED_SESSION_SERIALIZED');return false;}
    competing=await query('CONCURRENT_COMPETING_SESSION', `with eligible as materialized(select pipeline_image_id from public."21_content_pipeline_image" where pipeline_image_id in (${ids.join(',')}) and status in ('PENDING','RETRY') and (claim_token is null or claim_expires_at<now()) order by pipeline_image_id for update skip locked) select coalesce(jsonb_agg(pipeline_image_id),'[]'::jsonb) as acquired_ids,pg_backend_pid() as session_id from eligible`);
  } finally { await completion; if(holdError)throw holdError; }
  if(holdError)throw holdError;
  const heldRows=await completion, acquired=competing?.[0]?.acquired_ids;
  const first=heldRows?.[0], second=competing?.[0];
  if(!Array.isArray(heldRows)||heldRows.length!==1||Number(first?.pipeline_image_id)!==ids[0]||!Number.isSafeInteger(first?.session_id)||first.session_id<1||!Number.isSafeInteger(second?.session_id)||second.session_id<1||first.session_id===second.session_id||!Array.isArray(acquired)||acquired.some(id=>!Number.isSafeInteger(id))||acquired.includes(ids[0])||!acquired.includes(ids[1]))throw new Error('VISUAL_CONCURRENT_TASK_LOCK_FAILED');
  console.log('CONCURRENT_TASK_LOCKS: PASS'); return true;
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
    await queryProject('AUTHORING_MIGRATION', migrationTransaction(readFileSync('supabase/migrations/20261012073342_unified_authoring_no_inspection_chunks.sql','utf8'), {version:'20261012073342',name:'unified_authoring_no_inspection_chunks',followUp:true}));
    await queryProject('PHOTO_POLICY_MIGRATION', migrationTransaction(readFileSync('supabase/migrations/20261012203358_photo_source_policy.sql','utf8'), {version:'20261012203358',name:'photo_source_policy',followUp:true}));
    await queryProject('DUPLICATE_RECOVERY_MIGRATION',migrationTransaction(readFileSync('supabase/migrations/20261013055416_duplicate_source_recovery.sql','utf8'),{version:'20261013055416',name:'duplicate_source_recovery',followUp:true}));
    await queryProject('DUPLICATE_BINDING_CORRECTION',readFileSync('scripts/content-factory/duplicate-source-binding-fix.sql','utf8'));
    await queryProject('DUPLICATE_RECOVERY_REGRESSION',readFileSync('scripts/content-factory/duplicate-source-recovery-regression.sql','utf8'));
    await queryProject('PHOTO_POLICY_REGRESSION',readFileSync('scripts/content-factory/photo-source-policy-regression.sql','utf8'));
    await queryProject('AUTHORING_TRANSACTIONAL_REGRESSION',readFileSync('scripts/content-factory/authoring-regression.sql','utf8'));
    await queryProject('TRANSACTIONAL_REGRESSION', readFileSync('scripts/content-factory/visual-delivery-regression.sql', 'utf8'));
    await verifyConcurrentTaskLocks();
    await requireCurrentMain();
    // JWT verification is already disabled in deployed v35. The function retains
    // its existing custom worker authentication; no auth policy change here.
    cli('EDGE_DEPLOY', ['functions', 'deploy', 'content-pipeline-visual-mcp', '--project-ref', projectRef, '--use-api', '--no-verify-jwt']);
    cli('SOURCE_STAGE_DEPLOY', ['functions','deploy','content-pipeline-source-stage','--project-ref',projectRef,'--use-api','--no-verify-jwt']);
    await queryProject('DUPLICATE_INCIDENT_REPAIR',readFileSync('scripts/content-factory/duplicate-source-repair.sql','utf8'));
    console.log(`RELEASE_COMMIT: ${process.env.GITHUB_SHA}`);
    console.log('SCHEDULED_PIXEL_INSPECTION: NOT_VERIFIED; NATIVE_HANDOFF: NOT_VERIFIED');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
}


