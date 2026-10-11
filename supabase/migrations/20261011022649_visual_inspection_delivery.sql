-- Additive service-only delivery observations. No asset, Contract or Claim status rewrite.
create table public.content_pipeline_visual_delivery_event (
  event_id uuid primary key,
  sequence_no bigint generated always as identity unique,
  worker_key text not null,
  runtime text not null check (runtime in ('WORK','CHAT','SCHEDULED')),
  protocol_version text not null default 'PIXEL_DELIVERY_V1',
  scope text not null check (scope in ('ENVIRONMENT','CANDIDATE')),
  probe_id uuid,
  request_id uuid,
  job_id uuid,
  pipeline_image_id bigint,
  contract_hash text,
  canonical_sha text not null check (canonical_sha ~ '^[a-f0-9]{64}$'),
  execution_role text,
  stage text not null check (stage in ('SERVER_IMAGE_BLOCKS','CLIENT_PARSE','CLIENT_IMAGE_OUTPUT','PIXELS_INSPECTED')),
  outcome text not null check (outcome in ('PASS','FAIL')),
  code text not null check (code in ('PASS','RESPONSE_SHAPE_INVALID','IMAGE_BLOCK_MISSING','IMAGE_BLOCK_INVALID','CLIENT_PIXEL_RENDER_UNVERIFIED','AIO_RPC_ERROR','TRANSPORT_TIMEOUT','TRANSPORT_ERROR','DOWNLOAD_FAILED','DOWNLOAD_IDENTITY_MISMATCH','INSPECTION_RESPONSE_TOO_LARGE')),
  view_name text not null check (view_name in ('PROBE','CANONICAL','MOBILE390','CARD','HERO')),
  provenance text not null check (provenance in ('SERVER_OBSERVED','OPERATOR_REPORTED')),
  pixels_inspected boolean not null default false,
  pixel_qa text check (pixel_qa in ('PASS','FAIL','NOT_EVALUATED')),
  trace_id uuid,
  response_bytes integer check (response_bytes between 0 and 33554432),
  elapsed_ms integer check (elapsed_ms between 0 and 300000),
  created_at timestamptz not null default clock_timestamp(),
  check ((scope='ENVIRONMENT' and probe_id is not null and request_id is null and job_id is null and pipeline_image_id is null and view_name='PROBE') or (scope='CANDIDATE' and request_id is not null and job_id is not null and pipeline_image_id is not null and contract_hash is not null and execution_role is not null and view_name<>'PROBE'))
);
alter table public.content_pipeline_visual_delivery_event enable row level security;
revoke all on public.content_pipeline_visual_delivery_event from public,anon,authenticated;
grant select,insert,delete on public.content_pipeline_visual_delivery_event to service_role;
grant usage on sequence public.content_pipeline_visual_delivery_event_sequence_no_seq to service_role;
create index visual_delivery_environment_idx on public.content_pipeline_visual_delivery_event(worker_key,runtime,protocol_version,created_at desc) where scope='ENVIRONMENT';
create index visual_delivery_candidate_idx on public.content_pipeline_visual_delivery_event(worker_key,pipeline_image_id,contract_hash,canonical_sha,created_at desc) where scope='CANDIDATE';

create function public.content_pipeline_visual_delivery_health_v1(p_worker_key text,p_runtime text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_pass timestamptz; v_fail timestamptz; v_count integer; v_until timestamptz;
begin
  if p_runtime is null or p_runtime not in ('WORK','CHAT','SCHEDULED') then raise exception 'INVALID_DELIVERY_RUNTIME'; end if;
  select max(created_at) into v_pass from public.content_pipeline_visual_delivery_event
   where worker_key=p_worker_key and runtime=p_runtime and protocol_version='PIXEL_DELIVERY_V1' and scope='ENVIRONMENT'
     and provenance='OPERATOR_REPORTED' and stage='PIXELS_INSPECTED' and outcome='PASS' and pixels_inspected and created_at>now()-interval '30 minutes';
  select count(distinct probe_id),max(created_at) into v_count,v_fail from public.content_pipeline_visual_delivery_event
   where worker_key=p_worker_key and runtime=p_runtime and protocol_version='PIXEL_DELIVERY_V1' and scope='ENVIRONMENT'
     and provenance='OPERATOR_REPORTED' and outcome='FAIL' and created_at>greatest(coalesce(v_pass,'-infinity'::timestamptz),now()-interval '1 hour');
  v_until:=case when v_count>=2 then v_fail+interval '10 minutes' end;
  return jsonb_build_object('runtime',p_runtime,'deliveryVersion','PIXEL_DELIVERY_V1','ready',v_pass is not null and (v_fail is null or v_pass>v_fail),
    'state',case when v_until>now() then 'OPEN' when v_count>=2 then 'HALF_OPEN' when v_pass is not null and (v_fail is null or v_pass>v_fail) then 'CLOSED' else 'UNVERIFIED' end,
    'retryAfter',v_until,'probeRequired',v_pass is null or v_fail is not null,'provenance','OPERATOR_REPORTED','serverObservedClientPixels',false);
end $$;

create function public.content_pipeline_visual_delivery_backoff_v1(p_worker_key text,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_image bigint; v_hash text; v_role text; v_sha text; v_runtime text; v_until timestamptz;
begin
  select pipeline_image_id,response->>'generationContractHash',coalesce(response->>'executionRole','LEGACY') into v_image,v_hash,v_role
    from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
  if v_image is null then raise exception 'VISUAL_CLAIM_RECEIPT_REQUIRED'; end if;
  select canonical_sha,runtime into v_sha,v_runtime from public.content_pipeline_visual_delivery_event where worker_key=p_worker_key and request_id=p_request_id and scope='CANDIDATE' and contract_hash=v_hash and execution_role=v_role and protocol_version='PIXEL_DELIVERY_V1' order by sequence_no desc limit 1;
  select max(retry_after) into v_until from (
    select max(e.created_at)+interval '30 minutes' as retry_after
    from public.content_pipeline_visual_delivery_event e
    where e.worker_key=p_worker_key and e.pipeline_image_id=v_image and e.contract_hash=v_hash and e.execution_role=v_role and e.canonical_sha=v_sha and e.runtime=v_runtime
      and e.protocol_version='PIXEL_DELIVERY_V1' and e.scope='CANDIDATE' and e.outcome='FAIL' and e.created_at>now()-interval '1 hour'
      and e.created_at>coalesce((select max(p.created_at) from public.content_pipeline_visual_delivery_event p where p.worker_key=e.worker_key and p.pipeline_image_id=e.pipeline_image_id and p.contract_hash=e.contract_hash and p.canonical_sha=e.canonical_sha and p.runtime=e.runtime and p.execution_role=e.execution_role and p.view_name=e.view_name and p.stage='PIXELS_INSPECTED' and p.outcome='PASS' and p.pixels_inspected),'-infinity'::timestamptz)
    group by e.runtime,e.canonical_sha,e.execution_role,e.view_name,e.stage,e.code having count(distinct e.request_id)>=3
  ) failures;
  if v_until>now() then
    update public."21_content_pipeline_image" set next_eligible_at=greatest(coalesce(next_eligible_at,now()),v_until)
    where pipeline_image_id=v_image and generation_contract_hash=v_hash and status='RETRY'
      and (claim_token is null or claim_expires_at<=now())
      and not exists (select 1 from public."29_content_pipeline_visual_claim_request" r where r.pipeline_image_id=v_image and r.created_at>(select created_at from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id));
  end if;
  return jsonb_build_object('candidateCircuit',case when v_until>now() then 'OPEN' else 'CLOSED' end,'retryAfter',v_until,'assetPolicy','PRESERVE_JOB_SHA_NO_REGENERATION');
end $$;

create function public.content_pipeline_record_visual_delivery_v1(p_worker_key text,p_event jsonb,p_server boolean default false)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_id uuid; v_probe uuid; v_request uuid; v_job uuid; v_sha text; v_scope text; v_runtime text; v_stage text; v_outcome text; v_view text; v_image bigint; v_hash text; v_role text; v_current jsonb; v_evidence text; v_replay boolean; v_existing public.content_pipeline_visual_delivery_event%rowtype; v_new public.content_pipeline_visual_delivery_event%rowtype;
begin
  if p_server is null then raise exception 'INVALID_DELIVERY_EVENT'; end if;
  if jsonb_typeof(p_event) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_event) k where k not in ('eventId','probeId','requestId','jobId','expectedSha','scope','runtime','stage','outcome','code','view','pixelsInspected','pixelQa','evidence','traceId','responseBytes','elapsedMs')) then raise exception 'RESPONSE_SHAPE_INVALID'; end if;
  v_id:=(p_event->>'eventId')::uuid; v_probe:=(p_event->>'probeId')::uuid; v_request:=(p_event->>'requestId')::uuid; v_job:=(p_event->>'jobId')::uuid;
  v_sha:=p_event->>'expectedSha'; v_scope:=p_event->>'scope'; v_runtime:=p_event->>'runtime'; v_stage:=p_event->>'stage'; v_outcome:=p_event->>'outcome'; v_view:=coalesce(p_event->>'view',case when v_scope='ENVIRONMENT' then 'PROBE' end);
  if v_id is null or v_runtime is null or v_runtime not in ('WORK','CHAT','SCHEDULED') or v_sha is null or v_sha!~'^[a-f0-9]{64}$' or v_scope is null or v_scope not in ('ENVIRONMENT','CANDIDATE') or v_outcome is null or v_outcome not in ('PASS','FAIL') then raise exception 'INVALID_DELIVERY_EVENT'; end if;
  if (v_outcome='PASS') is distinct from (p_event->>'code'='PASS') then raise exception 'INVALID_DELIVERY_EVENT'; end if;
  if not p_server and (v_stage is null or v_stage not in ('CLIENT_PARSE','CLIENT_IMAGE_OUTPUT','PIXELS_INSPECTED')) then raise exception 'INVALID_DELIVERY_STAGE'; end if;
  if p_server and (v_stage<>'SERVER_IMAGE_BLOCKS' or v_scope<>'ENVIRONMENT' or v_outcome<>'PASS' or v_probe is distinct from v_id) then raise exception 'INVALID_DELIVERY_STAGE'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_worker_key||':'||v_id::text,0));
  select * into v_existing from public.content_pipeline_visual_delivery_event where event_id=v_id;
  v_replay:=found;
  if v_replay then
    if v_existing.worker_key<>p_worker_key then raise exception 'DELIVERY_EVENT_IMMUTABLE'; end if;
    v_image:=v_existing.pipeline_image_id; v_hash:=v_existing.contract_hash; v_role:=v_existing.execution_role;
  elsif v_scope='ENVIRONMENT' and not p_server then
    if not exists(select 1 from public.content_pipeline_visual_delivery_event where event_id=v_probe and worker_key=p_worker_key and runtime=v_runtime and scope='ENVIRONMENT' and provenance='SERVER_OBSERVED' and canonical_sha=v_sha and protocol_version='PIXEL_DELIVERY_V1' and created_at>now()-interval '30 minutes') then raise exception 'DELIVERY_PROBE_REQUIRED'; end if;
  elsif v_scope='CANDIDATE' then
    v_current:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,v_request);
    if v_current->'claim' is null or v_current->>'result'='CLAIM_NOT_OWNED' then raise exception 'VISUAL_CLAIM_RECEIPT_REQUIRED'; end if;
    v_image:=(v_current->'claim'->>'pipelineImageId')::bigint; v_hash:=v_current->'claim'->>'generationContractHash'; v_role:=coalesce(v_current->'claim'->>'executionRole','LEGACY');
    if not exists(select 1 from public."27_content_pipeline_source_stage_job" j join public."21_content_pipeline_image" i on i.pipeline_image_id=j.pipeline_image_id where j.job_id=v_job and j.pipeline_image_id=v_image and j.contract_hash=v_hash and i.generation_contract_hash=v_hash and j.result->>'sha256'=v_sha and j.status='STAGED') then raise exception 'SOURCE_JOB_ACCESS_DENIED'; end if;
  end if;
  if v_stage='PIXELS_INSPECTED' and v_outcome='PASS' then
    v_evidence:=p_event->>'evidence';
    if p_event->'pixelsInspected' is distinct from 'true'::jsonb or jsonb_typeof(p_event->'evidence') is distinct from 'string' or length(btrim(v_evidence))<20 or length(v_evidence)>1000 or v_evidence~*'(https?://|data:|bearer |download_url|[A-Za-z0-9+/]{120,})' then raise exception 'PIXEL_INSPECTION_EVIDENCE_REQUIRED'; end if;
    if v_scope='CANDIDATE' and (p_event->>'pixelQa' is null or p_event->>'pixelQa' not in ('PASS','FAIL')) then raise exception 'PIXEL_QA_REQUIRED'; end if;
  end if;
  -- Evidence is validated but never persisted; only bounded observation fields survive.
  v_new.event_id:=v_id; v_new.worker_key:=p_worker_key; v_new.runtime:=v_runtime; v_new.protocol_version:='PIXEL_DELIVERY_V1'; v_new.scope:=v_scope; v_new.probe_id:=v_probe; v_new.request_id:=v_request; v_new.job_id:=v_job; v_new.pipeline_image_id:=v_image; v_new.contract_hash:=v_hash; v_new.canonical_sha:=v_sha; v_new.execution_role:=v_role; v_new.stage:=v_stage; v_new.outcome:=v_outcome; v_new.code:=p_event->>'code'; v_new.view_name:=v_view; v_new.provenance:=case when p_server then 'SERVER_OBSERVED' else 'OPERATOR_REPORTED' end; v_new.pixels_inspected:=p_event->'pixelsInspected'='true'::jsonb; v_new.pixels_inspected:=coalesce(v_new.pixels_inspected,false); v_new.pixel_qa:=coalesce(p_event->>'pixelQa','NOT_EVALUATED'); v_new.trace_id:=(p_event->>'traceId')::uuid; v_new.response_bytes:=(p_event->>'responseBytes')::integer; v_new.elapsed_ms:=(p_event->>'elapsedMs')::integer; v_new.created_at:=clock_timestamp();
  if v_replay then
    if (to_jsonb(v_existing)-'created_at'-'sequence_no') is distinct from (to_jsonb(v_new)-'created_at'-'sequence_no') then raise exception 'DELIVERY_EVENT_IMMUTABLE'; end if;
  else insert into public.content_pipeline_visual_delivery_event (event_id,worker_key,runtime,protocol_version,scope,probe_id,request_id,job_id,pipeline_image_id,contract_hash,canonical_sha,execution_role,stage,outcome,code,view_name,provenance,pixels_inspected,pixel_qa,trace_id,response_bytes,elapsed_ms,created_at) values (v_new.event_id,v_new.worker_key,v_new.runtime,v_new.protocol_version,v_new.scope,v_new.probe_id,v_new.request_id,v_new.job_id,v_new.pipeline_image_id,v_new.contract_hash,v_new.canonical_sha,v_new.execution_role,v_new.stage,v_new.outcome,v_new.code,v_new.view_name,v_new.provenance,v_new.pixels_inspected,v_new.pixel_qa,v_new.trace_id,v_new.response_bytes,v_new.elapsed_ms,v_new.created_at); end if;
  delete from public.content_pipeline_visual_delivery_event where worker_key=p_worker_key and created_at<now()-interval '7 days';
  return jsonb_build_object('recorded',true,'eventId',v_id,'provenance',v_new.provenance,'serverObservedClientPixels',false,'semanticQa','NOT_EVALUATED','health',case when v_scope='ENVIRONMENT' then public.content_pipeline_visual_delivery_health_v1(p_worker_key,v_runtime) else null end,'backoff',case when v_scope='CANDIDATE' then public.content_pipeline_visual_delivery_backoff_v1(p_worker_key,v_request) else null end);
end $$;

create function public.content_pipeline_require_visual_pixel_report_v1(p_worker_key text,p_request_id uuid,p_job_id uuid,p_sha text,p_runtime text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if p_runtime is null or p_runtime not in ('WORK','CHAT','SCHEDULED') then raise exception 'INVALID_DELIVERY_RUNTIME'; end if;
  if (select count(*) from (
    select distinct on (view_name) view_name,stage,outcome,pixels_inspected,pixel_qa
    from public.content_pipeline_visual_delivery_event where worker_key=p_worker_key and request_id=p_request_id and job_id=p_job_id and canonical_sha=p_sha and runtime=p_runtime and protocol_version='PIXEL_DELIVERY_V1' and provenance='OPERATOR_REPORTED' and view_name in ('CANONICAL','MOBILE390')
    order by view_name,sequence_no desc
  ) latest where stage='PIXELS_INSPECTED' and outcome='PASS' and pixels_inspected and pixel_qa='PASS')<>2 then raise exception 'CLIENT_PIXEL_INSPECTION_REQUIRED'; end if;
  return jsonb_build_object('valid',true,'provenance','OPERATOR_REPORTED','serverObservedClientPixels',false);
end $$;

create function public.content_pipeline_claim_visual_delivery_v1(p_worker_key text,p_request_id uuid,p_role text,p_pipeline_image_id bigint,p_runtime text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_existing jsonb; v_health jsonb; v_result jsonb;
begin
  if p_runtime is null or p_runtime not in ('WORK','CHAT','SCHEDULED') then raise exception 'INVALID_DELIVERY_RUNTIME'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_worker_key||':delivery-claim:'||p_request_id::text,0));
  select response into v_existing from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
  if found then
    if v_existing->>'deliveryRuntime' is distinct from p_runtime then raise exception 'VISUAL_REQUEST_INPUT_CONFLICT'; end if;
  else
    v_health:=public.content_pipeline_visual_delivery_health_v1(p_worker_key,p_runtime);
    if v_health->>'ready' is distinct from 'true' then raise exception 'PIXEL_DELIVERY_PRECHECK_BLOCKED'; end if;
  end if;
  v_result:=public.content_pipeline_claim_visual_stage_v1(p_worker_key,p_request_id,p_role,p_pipeline_image_id);
  update public."29_content_pipeline_visual_claim_request" set response=response||jsonb_build_object('deliveryRuntime',p_runtime,'deliveryVersion','PIXEL_DELIVERY_V1') where worker_key=p_worker_key and request_id=p_request_id and response->>'deliveryRuntime' is null;
  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
end $$;

revoke all on function public.content_pipeline_visual_delivery_health_v1(text,text),public.content_pipeline_visual_delivery_backoff_v1(text,uuid),public.content_pipeline_record_visual_delivery_v1(text,jsonb,boolean),public.content_pipeline_require_visual_pixel_report_v1(text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_visual_delivery_health_v1(text,text),public.content_pipeline_visual_delivery_backoff_v1(text,uuid),public.content_pipeline_record_visual_delivery_v1(text,jsonb,boolean),public.content_pipeline_require_visual_pixel_report_v1(text,uuid,uuid,text,text) to service_role;

revoke all on function public.content_pipeline_claim_visual_delivery_v1(text,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_claim_visual_delivery_v1(text,uuid,text,bigint,text) to service_role;
