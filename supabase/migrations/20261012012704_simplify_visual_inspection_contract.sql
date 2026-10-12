-- No new tables/columns; existing history/assets/checkpoints stay unchanged.

do $guard$ begin if pg_get_functiondef('public.content_pipeline_record_visual_delivery_v1(text,jsonb,boolean)'::regprocedure) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_record_visual_delivery_v1(p_worker_key text, p_event jsonb, p_server boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''pg_catalog'', ''public''
AS $function$
declare v_id uuid; v_probe uuid; v_request uuid; v_job uuid; v_sha text; v_scope text; v_runtime text; v_stage text; v_outcome text; v_view text; v_image bigint; v_hash text; v_role text; v_current jsonb; v_evidence text; v_replay boolean; v_existing public.content_pipeline_visual_delivery_event%rowtype; v_new public.content_pipeline_visual_delivery_event%rowtype;
begin
  if p_server is null then raise exception ''INVALID_DELIVERY_EVENT''; end if;
  if jsonb_typeof(p_event) is distinct from ''object'' or exists(select 1 from jsonb_object_keys(p_event) k where k not in (''eventId'',''probeId'',''requestId'',''jobId'',''expectedSha'',''scope'',''runtime'',''stage'',''outcome'',''code'',''view'',''pixelsInspected'',''pixelQa'',''evidence'',''traceId'',''responseBytes'',''elapsedMs'')) then raise exception ''RESPONSE_SHAPE_INVALID''; end if;
  v_id:=(p_event->>''eventId'')::uuid; v_probe:=(p_event->>''probeId'')::uuid; v_request:=(p_event->>''requestId'')::uuid; v_job:=(p_event->>''jobId'')::uuid;
  v_sha:=p_event->>''expectedSha''; v_scope:=p_event->>''scope''; v_runtime:=p_event->>''runtime''; v_stage:=p_event->>''stage''; v_outcome:=p_event->>''outcome''; v_view:=coalesce(p_event->>''view'',case when v_scope=''ENVIRONMENT'' then ''PROBE'' end);
  if v_id is null or v_runtime is null or v_runtime not in (''WORK'',''CHAT'',''SCHEDULED'') or v_sha is null or v_sha!~''^[a-f0-9]{64}$'' or v_scope is null or v_scope not in (''ENVIRONMENT'',''CANDIDATE'') or v_outcome is null or v_outcome not in (''PASS'',''FAIL'') then raise exception ''INVALID_DELIVERY_EVENT''; end if;
  if (v_outcome=''PASS'') is distinct from (p_event->>''code''=''PASS'') then raise exception ''INVALID_DELIVERY_EVENT''; end if;
  if not p_server and (v_stage is null or v_stage not in (''CLIENT_PARSE'',''CLIENT_IMAGE_OUTPUT'',''PIXELS_INSPECTED'')) then raise exception ''INVALID_DELIVERY_STAGE''; end if;
  if p_server and (v_stage<>''SERVER_IMAGE_BLOCKS'' or v_scope<>''ENVIRONMENT'' or v_outcome<>''PASS'' or v_probe is distinct from v_id) then raise exception ''INVALID_DELIVERY_STAGE''; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_worker_key||'':''||v_id::text,0));
  select * into v_existing from public.content_pipeline_visual_delivery_event where event_id=v_id;
  v_replay:=found;
  if v_replay then
    if v_existing.worker_key<>p_worker_key then raise exception ''DELIVERY_EVENT_IMMUTABLE''; end if;
    v_image:=v_existing.pipeline_image_id; v_hash:=v_existing.contract_hash; v_role:=v_existing.execution_role;
  elsif v_scope=''ENVIRONMENT'' and not p_server then
    if not exists(select 1 from public.content_pipeline_visual_delivery_event where event_id=v_probe and worker_key=p_worker_key and runtime=v_runtime and scope=''ENVIRONMENT'' and provenance=''SERVER_OBSERVED'' and canonical_sha=v_sha and protocol_version=''PIXEL_DELIVERY_V1'' and created_at>now()-interval ''30 minutes'') then raise exception ''DELIVERY_PROBE_REQUIRED''; end if;
  elsif v_scope=''CANDIDATE'' then
    v_current:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,v_request);
    if v_current->''claim'' is null or v_current->>''result''=''CLAIM_NOT_OWNED'' then raise exception ''VISUAL_CLAIM_RECEIPT_REQUIRED''; end if;
    v_image:=(v_current->''claim''->>''pipelineImageId'')::bigint; v_hash:=v_current->''claim''->>''generationContractHash''; v_role:=coalesce(v_current->''claim''->>''executionRole'',''LEGACY'');
    if not exists(select 1 from public."27_content_pipeline_source_stage_job" j join public."21_content_pipeline_image" i on i.pipeline_image_id=j.pipeline_image_id where j.job_id=v_job and j.pipeline_image_id=v_image and j.contract_hash=v_hash and i.generation_contract_hash=v_hash and j.result->>''sha256''=v_sha and j.status=''STAGED'') then raise exception ''SOURCE_JOB_ACCESS_DENIED''; end if;
  end if;
  if v_stage=''PIXELS_INSPECTED'' and v_outcome=''PASS'' then
    v_evidence:=p_event->>''evidence'';
    if p_event->''pixelsInspected'' is distinct from ''true''::jsonb or jsonb_typeof(p_event->''evidence'') is distinct from ''string'' or length(btrim(v_evidence))<20 or length(v_evidence)>1000 or v_evidence~*''(https?://|data:|bearer |download_url|[A-Za-z0-9+/]{120,})'' then raise exception ''PIXEL_INSPECTION_EVIDENCE_REQUIRED''; end if;
    if v_scope=''CANDIDATE'' and (p_event->>''pixelQa'' is null or p_event->>''pixelQa'' not in (''PASS'',''FAIL'')) then raise exception ''PIXEL_QA_REQUIRED''; end if;
  end if;
  -- Evidence is validated but never persisted; only bounded observation fields survive.
  v_new.event_id:=v_id; v_new.worker_key:=p_worker_key; v_new.runtime:=v_runtime; v_new.protocol_version:=''PIXEL_DELIVERY_V1''; v_new.scope:=v_scope; v_new.probe_id:=v_probe; v_new.request_id:=v_request; v_new.job_id:=v_job; v_new.pipeline_image_id:=v_image; v_new.contract_hash:=v_hash; v_new.canonical_sha:=v_sha; v_new.execution_role:=v_role; v_new.stage:=v_stage; v_new.outcome:=v_outcome; v_new.code:=p_event->>''code''; v_new.view_name:=v_view; v_new.provenance:=case when p_server then ''SERVER_OBSERVED'' else ''OPERATOR_REPORTED'' end; v_new.pixels_inspected:=p_event->''pixelsInspected''=''true''::jsonb; v_new.pixels_inspected:=coalesce(v_new.pixels_inspected,false); v_new.pixel_qa:=coalesce(p_event->>''pixelQa'',''NOT_EVALUATED''); v_new.trace_id:=(p_event->>''traceId'')::uuid; v_new.response_bytes:=(p_event->>''responseBytes'')::integer; v_new.elapsed_ms:=(p_event->>''elapsedMs'')::integer; v_new.created_at:=clock_timestamp();
  if v_replay then
    if (to_jsonb(v_existing)-''created_at''-''sequence_no'') is distinct from (to_jsonb(v_new)-''created_at''-''sequence_no'') then raise exception ''DELIVERY_EVENT_IMMUTABLE''; end if;
  else insert into public.content_pipeline_visual_delivery_event (event_id,worker_key,runtime,protocol_version,scope,probe_id,request_id,job_id,pipeline_image_id,contract_hash,canonical_sha,execution_role,stage,outcome,code,view_name,provenance,pixels_inspected,pixel_qa,trace_id,response_bytes,elapsed_ms,created_at) values (v_new.event_id,v_new.worker_key,v_new.runtime,v_new.protocol_version,v_new.scope,v_new.probe_id,v_new.request_id,v_new.job_id,v_new.pipeline_image_id,v_new.contract_hash,v_new.canonical_sha,v_new.execution_role,v_new.stage,v_new.outcome,v_new.code,v_new.view_name,v_new.provenance,v_new.pixels_inspected,v_new.pixel_qa,v_new.trace_id,v_new.response_bytes,v_new.elapsed_ms,v_new.created_at); end if;
  delete from public.content_pipeline_visual_delivery_event where worker_key=p_worker_key and created_at<now()-interval ''7 days'';
  return jsonb_build_object(''recorded'',true,''eventId'',v_id,''provenance'',v_new.provenance,''serverObservedClientPixels'',false,''semanticQa'',''NOT_EVALUATED'',''health'',case when v_scope=''ENVIRONMENT'' then public.content_pipeline_visual_delivery_health_v1(p_worker_key,v_runtime) else null end,''backoff'',case when v_scope=''CANDIDATE'' then public.content_pipeline_visual_delivery_backoff_v1(p_worker_key,v_request) else null end);
end $function$
' then raise exception 'VISUAL_SIMPLIFICATION_BASELINE_DRIFT'; end if; end $guard$;

CREATE OR REPLACE FUNCTION public.content_pipeline_record_visual_delivery_v1(p_worker_key text, p_event jsonb, p_server boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_id uuid; v_probe uuid; v_request uuid; v_job uuid; v_sha text; v_scope text; v_runtime text; v_stage text; v_outcome text; v_view text; v_image bigint; v_hash text; v_role text; v_current jsonb; v_evidence text; v_replay boolean; v_existing public.content_pipeline_visual_delivery_event%rowtype; v_new public.content_pipeline_visual_delivery_event%rowtype;
begin
  if p_server is null then raise exception 'INVALID_DELIVERY_EVENT'; end if;
  if jsonb_typeof(p_event) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_event) k where k not in ('eventId','probeId','requestId','jobId','expectedSha','scope','runtime','stage','outcome','code','view','pixelsInspected','pixelQa','evidence','traceId','responseBytes','elapsedMs')) then raise exception 'DELIVERY_REQUEST_INVALID'; end if;
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
    if v_current->'claim' is null or v_current->>'activeClaim' is distinct from 'true' then raise exception 'VISUAL_CLAIM_RECEIPT_REQUIRED'; end if;
    if v_current->'claim'->>'deliveryRuntime' is not null and v_current->'claim'->>'deliveryRuntime' is distinct from v_runtime then raise exception 'INVALID_DELIVERY_RUNTIME'; end if;
    v_image:=(v_current->'claim'->>'pipelineImageId')::bigint; v_hash:=v_current->'claim'->>'generationContractHash'; v_role:=coalesce(v_current->'claim'->>'executionRole','LEGACY');
    if not exists(select 1 from public."27_content_pipeline_source_stage_job" j join public."21_content_pipeline_image" i on i.pipeline_image_id=j.pipeline_image_id where j.job_id=v_job and j.spec->'visualMcpOperation'->>'workerKey'=p_worker_key and j.pipeline_image_id=v_image and j.contract_hash=v_hash and i.generation_contract_hash=v_hash and j.result->>'sha256'=v_sha and j.status='STAGED') then raise exception 'SOURCE_JOB_ACCESS_DENIED'; end if;
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
end $function$;

do $guard$ begin if pg_get_functiondef('public.content_pipeline_claim_visual_stage_v1(text,uuid,text,bigint)'::regprocedure) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_stage_v1(p_worker_key text, p_request_id uuid, p_role text, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
declare r public."29_content_pipeline_visual_claim_request"%rowtype;c jsonb;
begin
 if p_role not in (''PRODUCER'',''REVIEWER'') or p_role is null or p_request_id is null or length(coalesce(p_worker_key,'''')) not between 1 and 100 then raise exception ''INVALID_VISUAL_STAGE_REQUEST'';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''visual-request:''||p_worker_key,0));
 select * into r from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
 if found then
  if r.target_image_id is distinct from p_pipeline_image_id or r.response->>''executionRole'' is distinct from p_role then raise exception ''VISUAL_REQUEST_INPUT_CONFLICT'';end if;
  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object(''replayed'',true);
 end if;
 if p_pipeline_image_id is not null and exists(select 1 from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id and status=''PROCESSING'' and claim_expires_at>=now()) then
  return jsonb_build_object(''result'',''BUSY'',''activeClaim'',false,''reason'',''TARGET_IMAGE_OWNS_ACTIVE_CLAIM'',''nextAction'',''CLAIM_NEXT_ELIGIBLE_IMAGE'');end if;
 if p_role=''REVIEWER'' then c:=public.content_pipeline_claim_visual_reviewer_v1(p_worker_key,p_pipeline_image_id);
 else c:=public.content_pipeline_claim_visual_producer_v1(p_worker_key,p_pipeline_image_id);end if;
 c:=coalesce(c,''{}''::jsonb)||jsonb_build_object(''executionRole'',p_role);
 insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,target_image_id,pipeline_image_id,response)
 values(p_worker_key,p_request_id,p_pipeline_image_id,(c->>''pipelineImageId'')::bigint,c);
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object(''replayed'',false);
end $function$
' then raise exception 'VISUAL_SIMPLIFICATION_BASELINE_DRIFT'; end if; end $guard$;

CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_stage_v1(p_worker_key text, p_request_id uuid, p_role text, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public."29_content_pipeline_visual_claim_request"%rowtype;c jsonb;
begin
 if p_role not in ('PRODUCER','REVIEWER') or p_role is null or p_request_id is null or length(coalesce(p_worker_key,'')) not between 1 and 100 then raise exception 'INVALID_VISUAL_STAGE_REQUEST';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visual-request:'||p_worker_key,0));
 select * into r from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
 if found then
  if r.target_image_id is distinct from p_pipeline_image_id or r.response->>'executionRole' is distinct from p_role then raise exception 'VISUAL_REQUEST_INPUT_CONFLICT';end if;
  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object('replayed',true);
 end if;
 if p_pipeline_image_id is not null and exists(select 1 from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id and status='PROCESSING' and claim_expires_at>=now()) then
  return jsonb_build_object('result','BUSY','activeClaim',false,'reason','TARGET_IMAGE_OWNS_ACTIVE_CLAIM','nextAction','CLAIM_NEXT_ELIGIBLE_IMAGE');end if;
 if p_role='REVIEWER' then c:=public.content_pipeline_claim_visual_reviewer_v1(p_worker_key,p_pipeline_image_id);
 else c:=public.content_pipeline_claim_visual_producer_v1(p_worker_key,p_pipeline_image_id);end if;
 c:=coalesce(c,'{}'::jsonb)||jsonb_build_object('executionRole',p_role);
 insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,target_image_id,pipeline_image_id,response)
 values(p_worker_key,p_request_id,p_pipeline_image_id,(c->>'pipelineImageId')::bigint,c-array['nativeGenerationContext','nativeGenerationIsolationPolicy','runtimePolicy','reviewRequirements','preservedStagingInput']::text[]);
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object('replayed',false);
end $function$;

do $guard$ begin if pg_get_functiondef('public.content_pipeline_claim_visual_request_v1(text,uuid,bigint)'::regprocedure) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_request_v1(p_worker_key text, p_request_id uuid, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
declare
  r public."29_content_pipeline_visual_claim_request"%rowtype;
  i public."21_content_pipeline_image"%rowtype;
  response jsonb;
  run_id bigint;
begin
  if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 or p_request_id is null then
    raise exception ''INVALID_VISUAL_REQUEST'';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(''visual-request:''||p_worker_key,0));

  select * into r
  from public."29_content_pipeline_visual_claim_request"
  where worker_key=p_worker_key and request_id=p_request_id;

  if found then
    if r.target_image_id is distinct from p_pipeline_image_id then
      raise exception ''VISUAL_REQUEST_INPUT_CONFLICT'';
    end if;
    return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)
      || jsonb_build_object(''replayed'',true);
  end if;

  -- Lease exclusion is image-scoped; other images sharing a Worker remain eligible.
  if p_pipeline_image_id is not null and exists(
    select 1 from public."21_content_pipeline_image"
    where pipeline_image_id=p_pipeline_image_id and status=''PROCESSING''
      and claim_expires_at>=now()) then
    return jsonb_build_object(''requestId'',p_request_id,''result'',''BUSY'',
      ''activeClaim'',false,''claim'',null,''reason'',''TARGET_IMAGE_OWNS_ACTIVE_CLAIM'',
      ''nextAction'',''CLAIM_NEXT_ELIGIBLE_IMAGE'');
  end if;
  response:=public.content_pipeline_claim_visual_producer_v1(p_worker_key,p_pipeline_image_id);

  insert into public."29_content_pipeline_visual_claim_request"
    (worker_key,request_id,target_image_id,pipeline_image_id,response)
  values(
    p_worker_key,
    p_request_id,
    p_pipeline_image_id,
    (response->>''pipelineImageId'')::bigint,
    response
  );

  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)
    || jsonb_build_object(''replayed'',false);
end
$function$
' then raise exception 'VISUAL_SIMPLIFICATION_BASELINE_DRIFT'; end if; end $guard$;

CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_request_v1(p_worker_key text, p_request_id uuid, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public."29_content_pipeline_visual_claim_request"%rowtype;
  i public."21_content_pipeline_image"%rowtype;
  response jsonb;
  run_id bigint;
begin
  if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 or p_request_id is null then
    raise exception 'INVALID_VISUAL_REQUEST';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visual-request:'||p_worker_key,0));

  select * into r
  from public."29_content_pipeline_visual_claim_request"
  where worker_key=p_worker_key and request_id=p_request_id;

  if found then
    if r.target_image_id is distinct from p_pipeline_image_id then
      raise exception 'VISUAL_REQUEST_INPUT_CONFLICT';
    end if;
    return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)
      || jsonb_build_object('replayed',true);
  end if;

  -- Lease exclusion is image-scoped; other images sharing a Worker remain eligible.
  if p_pipeline_image_id is not null and exists(
    select 1 from public."21_content_pipeline_image"
    where pipeline_image_id=p_pipeline_image_id and status='PROCESSING'
      and claim_expires_at>=now()) then
    return jsonb_build_object('requestId',p_request_id,'result','BUSY',
      'activeClaim',false,'claim',null,'reason','TARGET_IMAGE_OWNS_ACTIVE_CLAIM',
      'nextAction','CLAIM_NEXT_ELIGIBLE_IMAGE');
  end if;
  response:=public.content_pipeline_claim_visual_producer_v1(p_worker_key,p_pipeline_image_id);

  insert into public."29_content_pipeline_visual_claim_request"
    (worker_key,request_id,target_image_id,pipeline_image_id,response)
  values(
    p_worker_key,
    p_request_id,
    p_pipeline_image_id,
    (response->>'pipelineImageId')::bigint,
    response-array['nativeGenerationContext','nativeGenerationIsolationPolicy','runtimePolicy','reviewRequirements','preservedStagingInput']::text[]
  );

  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)
    || jsonb_build_object('replayed',false);
end
$function$;

do $guard$ begin if pg_get_functiondef('public.content_pipeline_claim_visual_producer_v1(text,bigint)'::regprocedure) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_producer_v1(p_worker_key text, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
declare
 i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype;
 v_token uuid:=extensions.gen_random_uuid(); v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text; v_isolation jsonb; v_native_context jsonb;
 v_policy jsonb; v_review jsonb; v_version int;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_INVALID_WORKER_KEY''; end if;
 for p in select p0.* from public."18_content_pipeline" p0 join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id where p0.ownership_state=''CLAIMED'' and p0.stage in (''DRAFTED'',''VISUAL'') order by t0.priority,t0.content_topic_id,p0.pipeline_id loop
   begin perform public.content_pipeline_sync_images_v1(p.pipeline_id); exception when others then continue; end;
 end loop;
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id
 where p0.ownership_state=''CLAIMED'' and p0.stage in (''DRAFTED'',''VISUAL'')
   and (p_pipeline_image_id is null or i0.pipeline_image_id=p_pipeline_image_id)
   and public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,(i0.review_candidate->>''jobId'')::uuid) is null
   and not exists(select 1 from public."27_content_pipeline_source_stage_job" running where running.pipeline_image_id=i0.pipeline_image_id and running.status in (''PENDING'',''RUNNING''))
   and i0.status in (''PENDING'',''RETRY'',''PROCESSING'') and i0.staging_asset is null
   and i0.generation_contract is not null and i0.generation_contract_hash is not null
   and (coalesce((i0.generation_contract->>''contract_version'')::int,3)<4
        or (coalesce((i0.generation_contract->>''contract_version'')::int,3)=4 and i0.generation_contract->''production_feasibility''->>''status''=''PASS'')
        or (i0.generation_contract->''contract_version''=''5''::jsonb and public.content_pipeline_validate_visual_contract_v5(i0.generation_contract,true)->>''status''=''PASS''))
   and not (i0.status=''RETRY'' and coalesce(i0.next_eligible_at,''-infinity''::timestamptz)>now())
   and not (i0.status=''PROCESSING'' and i0.claim_expires_at>=now())
 order by case
 when public.content_pipeline_owned_visual_candidate_v1(p_worker_key,i0.pipeline_image_id) is not null then 0
 when public.content_pipeline_owned_visual_recovery_v1(p_worker_key,i0.pipeline_image_id) is not null then 1
 when public.content_pipeline_owned_native_input_v1(p_worker_key,i0.pipeline_image_id) is not null then 2
 when i0.staging_input->>''contractHash''=i0.generation_contract_hash and exists (
 select 1 from public."25_content_pipeline_generated_asset_handoff" h
 where h.handoff_id::text=i0.staging_input->>''handoffId'' and h.pipeline_image_id=i0.pipeline_image_id and h.consumed_at is null) then 3
 when i0.status in (''RETRY'',''PROCESSING'') then 4 else 5 end,
 t0.priority,t0.content_topic_id,p0.pipeline_id,i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 v_old_token:=i.claim_token;
 if i.status=''PROCESSING'' and i.claim_expires_at<now() and v_old_token is not null then
  update public."23_content_pipeline_image_run" set status=''FAILED'',completed_at=now(),failure_stage=''CLAIM'',failure_code=''CLAIM_EXPIRED'',error=''Image claim TTL expired before Complete/Fail RPC.'',metadata=coalesce(metadata,''{}''::jsonb)||jsonb_build_object(''reclaimedAt'',now()) where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status=''RUNNING'';
 end if;
 v_contract:=i.generation_contract; v_hash:=i.generation_contract_hash; v_version:=coalesce((v_contract->>''contract_version'')::int,4);
 if encode(extensions.digest(convert_to(v_contract::text,''UTF8''),''sha256''),''hex'')<>v_hash then raise exception ''CONTENT_PIPELINE_CONTRACT_HASH_MISMATCH''; end if;
 v_policy:=public.content_pipeline_visual_contract_policy_v1(v_contract);
 v_review:=public.content_pipeline_visual_review_requirements_v1(v_contract);
 v_isolation:=jsonb_build_object(''mode'',''FRESH_TASK_ONLY'',''numLastImagesToInclude'',0,''allowPreviousTaskImages'',false,''allowPreviousTaskPrompt'',false,''referenceImagesScope'',''CURRENT_PIPELINE_IMAGE_ONLY'',''isolationKey'',i.pipeline_image_id::text||'':''||v_hash,''onIsolationMismatch'',''REGENERATE_WITH_FRESH_CONTEXT_ONCE_THEN_RETRY'');
 if v_version>=5 then
   v_native_context:=jsonb_strip_nulls(jsonb_build_object(
     ''pipelineImageId'',i.pipeline_image_id,''generationContractHash'',v_hash,
     ''subject'',case when jsonb_typeof(v_contract->''must_show'')=''array'' and jsonb_array_length(v_contract->''must_show'')>0 then v_contract->''must_show''->>0 end,
     ''sceneDescription'',v_contract->>''visual_objective'',
     ''mustShow'',coalesce(v_contract->''must_show'',''[]''::jsonb),''mustNotShow'',coalesce(v_contract->''must_not_show'',''[]''::jsonb),
     ''peopleMode'',v_policy->>''peoplePolicy'',''mobileRequirement'',v_review->>''mobileRule'',
     ''qaCoreRequired'',coalesce(v_contract->''must_show'',''[]''::jsonb),''semanticObjectiveIsGate'',false,
     ''runtimePolicy'',v_policy,''reviewRequirements'',v_review
   ));
 else
   v_native_context:=jsonb_strip_nulls(jsonb_build_object(
     ''pipelineImageId'',i.pipeline_image_id,''generationContractHash'',v_hash,
     ''subject'',coalesce(v_contract->>''subject'',v_contract->>''inspection_target'',case when jsonb_typeof(v_contract->''must_show'')=''array'' and jsonb_array_length(v_contract->''must_show'')>0 then v_contract->''must_show''->>0 end),
     ''sceneDescription'',coalesce(v_contract->''scene''->>''description'',v_contract->>''visual_objective''),
     ''compositionPlan'',v_contract->''composition_plan'',''mustShow'',coalesce(v_contract->''must_show'',''[]''::jsonb),''mustNotShow'',coalesce(v_contract->''must_not_show'',''[]''::jsonb),
     ''peopleMode'',coalesce(v_contract->>''people_mode'',''NONE''),''annotationContract'',v_contract->''annotation_contract'',''mobileRequirement'',v_contract->>''mobile_requirement'',
     ''qaCoreRequired'',coalesce(v_contract->''pixel_qa_contract''->''required_visible'',''[]''::jsonb),''semanticObjectiveIsGate'',false,
     ''runtimePolicy'',v_policy,''reviewRequirements'',v_review
   ));
 end if;
 update public."18_content_pipeline" set stage=''VISUAL'',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage=''DRAFTED'';
 update public."21_content_pipeline_image" set visual_phase=''PRODUCING'',review_candidate=null,status=''PROCESSING'',handoff_phase=''PRODUCING'',upload_request_id=null,upload_dispatched_at=null,claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval ''60 minutes'',attempt_count=attempt_count+1,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now() where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata)
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,''RUNNING'',jsonb_build_object(''generationContractHash'',v_hash,''generationContract'',v_contract,''runtimePolicy'',v_policy,''reviewRequirements'',v_review,''nativeGenerationIsolationPolicy'',v_isolation,''nativeGenerationContext'',v_native_context,''claimOrder'',''OWNED_PREFLIGHT_RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING'',''claimTtlMinutes'',60,''contractSource'',case when v_version>=5 then ''STAGE2_V5_SEMANTIC'' else ''STAGE2_V4_IMMUTABLE'' end)) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>''contractHash''=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval ''60 minutes'' where handoff_id=(i.staging_input->>''handoffId'')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object(''pipelineImageId'',i.pipeline_image_id,''pipelineImageRunId'',v_run,''claimToken'',v_token,''pipelineId'',i.pipeline_id,''contentKey'',p.content_key,''topicKey'',p.topic_key,''imageId'',i.image_id,''assetKey'',i.asset_key,''ordinal'',i.ordinal,''attemptNo'',i.attempt_count,''generationContract'',v_contract,''generationContractHash'',v_hash,''runtimePolicy'',v_policy,''reviewRequirements'',v_review,''nativeGenerationIsolationPolicy'',v_isolation,''nativeGenerationContext'',v_native_context,''claimExpiresAt'',i.claim_expires_at,''preservedStagingInput'',case when i.staging_input->>''contractHash''=v_hash then i.staging_input else null end);
end
$function$
' then raise exception 'VISUAL_SIMPLIFICATION_BASELINE_DRIFT'; end if; end $guard$;

CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_producer_v1(p_worker_key text, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype;
 v_token uuid:=extensions.gen_random_uuid(); v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text; v_isolation jsonb; v_native_context jsonb;
 v_policy jsonb; v_review jsonb; v_version int;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_WORKER_KEY'; end if;
 for p in select p0.* from public."18_content_pipeline" p0 join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL') order by t0.priority,t0.content_topic_id,p0.pipeline_id loop
   begin perform public.content_pipeline_sync_images_v1(p.pipeline_id); exception when others then continue; end;
 end loop;
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id
 where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL')
   and (p_pipeline_image_id is null or i0.pipeline_image_id=p_pipeline_image_id)
   and public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,(i0.review_candidate->>'jobId')::uuid) is null
   and not exists(select 1 from public."27_content_pipeline_source_stage_job" running where running.pipeline_image_id=i0.pipeline_image_id and running.status in ('PENDING','RUNNING'))
   and i0.status in ('PENDING','RETRY','PROCESSING') and i0.staging_asset is null
   and i0.generation_contract is not null and i0.generation_contract_hash is not null
   and (coalesce((i0.generation_contract->>'contract_version')::int,3)<4
        or (coalesce((i0.generation_contract->>'contract_version')::int,3)=4 and i0.generation_contract->'production_feasibility'->>'status'='PASS')
        or (i0.generation_contract->'contract_version'='5'::jsonb and public.content_pipeline_validate_visual_contract_v5(i0.generation_contract,true)->>'status'='PASS'))
   and not (i0.status='RETRY' and coalesce(i0.next_eligible_at,'-infinity'::timestamptz)>now())
   and not (i0.status='PROCESSING' and i0.claim_expires_at>=now())
 order by case
 when public.content_pipeline_owned_visual_candidate_v1(p_worker_key,i0.pipeline_image_id) is not null then 0
 when public.content_pipeline_owned_visual_recovery_v1(p_worker_key,i0.pipeline_image_id) is not null then 1
 when public.content_pipeline_owned_native_input_v1(p_worker_key,i0.pipeline_image_id) is not null then 2
 when i0.staging_input->>'contractHash'=i0.generation_contract_hash and exists (
 select 1 from public."25_content_pipeline_generated_asset_handoff" h
 where h.handoff_id::text=i0.staging_input->>'handoffId' and h.pipeline_image_id=i0.pipeline_image_id and h.consumed_at is null) then 3
 when i0.status in ('RETRY','PROCESSING') then 4 else 5 end,
 t0.priority,t0.content_topic_id,p0.pipeline_id,i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 v_old_token:=i.claim_token;
 if i.status='PROCESSING' and i.claim_expires_at<now() and v_old_token is not null then
  update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_EXPIRED',error='Image claim TTL expired before Complete/Fail RPC.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reclaimedAt',now()) where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status='RUNNING';
 end if;
 v_contract:=i.generation_contract; v_hash:=i.generation_contract_hash; v_version:=coalesce((v_contract->>'contract_version')::int,4);
 if encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex')<>v_hash then raise exception 'CONTENT_PIPELINE_CONTRACT_HASH_MISMATCH'; end if;
 v_policy:=public.content_pipeline_visual_contract_policy_v1(v_contract);
 v_review:=public.content_pipeline_visual_review_requirements_v1(v_contract);
 v_isolation:=jsonb_build_object('mode','FRESH_TASK_ONLY','numLastImagesToInclude',0,'allowPreviousTaskImages',false,'allowPreviousTaskPrompt',false,'referenceImagesScope','CURRENT_PIPELINE_IMAGE_ONLY','isolationKey',i.pipeline_image_id::text||':'||v_hash,'onIsolationMismatch','REGENERATE_WITH_FRESH_CONTEXT_ONCE_THEN_RETRY');
 if v_version>=5 then
   v_native_context:=jsonb_strip_nulls(jsonb_build_object(
     'pipelineImageId',i.pipeline_image_id,'generationContractHash',v_hash,
     'subject',case when jsonb_typeof(v_contract->'must_show')='array' and jsonb_array_length(v_contract->'must_show')>0 then v_contract->'must_show'->>0 end,
     'sceneDescription',v_contract->>'visual_objective',
     'mustShow',coalesce(v_contract->'must_show','[]'::jsonb),'mustNotShow',coalesce(v_contract->'must_not_show','[]'::jsonb),
     'peopleMode',v_policy->>'peoplePolicy','mobileRequirement',v_review->>'mobileRule',
     'qaCoreRequired',coalesce(v_contract->'must_show','[]'::jsonb),'semanticObjectiveIsGate',false,
     'runtimePolicy',v_policy,'reviewRequirements',v_review
   ));
 else
   v_native_context:=jsonb_strip_nulls(jsonb_build_object(
     'pipelineImageId',i.pipeline_image_id,'generationContractHash',v_hash,
     'subject',coalesce(v_contract->>'subject',v_contract->>'inspection_target',case when jsonb_typeof(v_contract->'must_show')='array' and jsonb_array_length(v_contract->'must_show')>0 then v_contract->'must_show'->>0 end),
     'sceneDescription',coalesce(v_contract->'scene'->>'description',v_contract->>'visual_objective'),
     'compositionPlan',v_contract->'composition_plan','mustShow',coalesce(v_contract->'must_show','[]'::jsonb),'mustNotShow',coalesce(v_contract->'must_not_show','[]'::jsonb),
     'peopleMode',coalesce(v_contract->>'people_mode','NONE'),'annotationContract',v_contract->'annotation_contract','mobileRequirement',v_contract->>'mobile_requirement',
     'qaCoreRequired',coalesce(v_contract->'pixel_qa_contract'->'required_visible','[]'::jsonb),'semanticObjectiveIsGate',false,
     'runtimePolicy',v_policy,'reviewRequirements',v_review
   ));
 end if;
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage='DRAFTED';
 update public."21_content_pipeline_image" set visual_phase='PRODUCING',review_candidate=null,status='PROCESSING',handoff_phase='PRODUCING',upload_request_id=null,upload_dispatched_at=null,claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval '60 minutes',attempt_count=attempt_count+1,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now() where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata)
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('executionRole','PRODUCER','generationContractHash',v_hash,'generationContract',v_contract,'claimOrder','OWNED_PREFLIGHT_RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING','claimTtlMinutes',60,'contractSource',case when v_version>=5 then 'STAGE2_V5_SEMANTIC' else 'STAGE2_V4_IMMUTABLE' end)) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes' where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'runtimePolicy',v_policy,'reviewRequirements',v_review,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end
$function$;

do $guard$ begin if pg_get_functiondef('public.content_pipeline_claim_visual_reviewer_v1(text,bigint)'::regprocedure) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_reviewer_v1(p_worker_key text, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
declare
 i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype;
 v_token uuid:=extensions.gen_random_uuid(); v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text; v_isolation jsonb; v_native_context jsonb;
 v_policy jsonb; v_review jsonb; v_version int;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_INVALID_WORKER_KEY''; end if;
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id
 where p0.ownership_state=''CLAIMED'' and p0.stage in (''DRAFTED'',''VISUAL'')
   and (p_pipeline_image_id is null or i0.pipeline_image_id=p_pipeline_image_id)
   and i0.visual_phase in (''QA_PENDING'',''REVIEWING'')
   and exists(select 1 from public."27_content_pipeline_source_stage_job" own where own.job_id=(i0.review_candidate->>''jobId'')::uuid and own.spec->''visualMcpOperation''->>''workerKey''=p_worker_key)
   and public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,(i0.review_candidate->>''jobId'')::uuid) is not null
   and not exists(select 1 from public."27_content_pipeline_source_stage_job" running where running.pipeline_image_id=i0.pipeline_image_id and running.status in (''PENDING'',''RUNNING''))
   and i0.status in (''PENDING'',''RETRY'',''PROCESSING'') and i0.staging_asset is null
   and i0.generation_contract is not null and i0.generation_contract_hash is not null
   and (coalesce((i0.generation_contract->>''contract_version'')::int,3)<4
        or (coalesce((i0.generation_contract->>''contract_version'')::int,3)=4 and i0.generation_contract->''production_feasibility''->>''status''=''PASS'')
        or (i0.generation_contract->''contract_version''=''5''::jsonb and public.content_pipeline_validate_visual_contract_v5(i0.generation_contract,true)->>''status''=''PASS''))
   and not (i0.status=''RETRY'' and coalesce(i0.next_eligible_at,''-infinity''::timestamptz)>now())
   and not (i0.status=''PROCESSING'' and i0.claim_expires_at>=now())
 order by case when public.content_pipeline_visual_recovery_v1(i0.pipeline_image_id) is not null then 0
 when i0.staging_input->>''contractHash''=i0.generation_contract_hash and exists (
 select 1 from public."25_content_pipeline_generated_asset_handoff" h where h.handoff_id::text=i0.staging_input->>''handoffId'' and h.pipeline_image_id=i0.pipeline_image_id and h.consumed_at is null) then 1
 when i0.status in (''RETRY'',''PROCESSING'') then 2 else 3 end,
 t0.priority,t0.content_topic_id,p0.pipeline_id,i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 v_old_token:=i.claim_token;
 if i.status=''PROCESSING'' and i.claim_expires_at<now() and v_old_token is not null then
  update public."23_content_pipeline_image_run" set status=''FAILED'',completed_at=now(),failure_stage=''CLAIM'',failure_code=''CLAIM_EXPIRED'',error=''Image claim TTL expired before Complete/Fail RPC.'',metadata=coalesce(metadata,''{}''::jsonb)||jsonb_build_object(''reclaimedAt'',now()) where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status=''RUNNING'';
 end if;
 v_contract:=i.generation_contract; v_hash:=i.generation_contract_hash; v_version:=coalesce((v_contract->>''contract_version'')::int,4);
 if encode(extensions.digest(convert_to(v_contract::text,''UTF8''),''sha256''),''hex'')<>v_hash then raise exception ''CONTENT_PIPELINE_CONTRACT_HASH_MISMATCH''; end if;
 v_policy:=public.content_pipeline_visual_contract_policy_v1(v_contract);
 v_review:=public.content_pipeline_visual_review_requirements_v1(v_contract);
 v_isolation:=jsonb_build_object(''mode'',''FRESH_TASK_ONLY'',''numLastImagesToInclude'',0,''allowPreviousTaskImages'',false,''allowPreviousTaskPrompt'',false,''referenceImagesScope'',''CURRENT_PIPELINE_IMAGE_ONLY'',''isolationKey'',i.pipeline_image_id::text||'':''||v_hash,''onIsolationMismatch'',''REGENERATE_WITH_FRESH_CONTEXT_ONCE_THEN_RETRY'');
 if v_version>=5 then
   v_native_context:=jsonb_strip_nulls(jsonb_build_object(
     ''pipelineImageId'',i.pipeline_image_id,''generationContractHash'',v_hash,
     ''subject'',case when jsonb_typeof(v_contract->''must_show'')=''array'' and jsonb_array_length(v_contract->''must_show'')>0 then v_contract->''must_show''->>0 end,
     ''sceneDescription'',v_contract->>''visual_objective'',''mustShow'',coalesce(v_contract->''must_show'',''[]''::jsonb),''mustNotShow'',coalesce(v_contract->''must_not_show'',''[]''::jsonb),
     ''peopleMode'',v_policy->>''peoplePolicy'',''mobileRequirement'',v_review->>''mobileRule'',''qaCoreRequired'',coalesce(v_contract->''must_show'',''[]''::jsonb),''semanticObjectiveIsGate'',false,
     ''runtimePolicy'',v_policy,''reviewRequirements'',v_review
   ));
 else
   v_native_context:=jsonb_strip_nulls(jsonb_build_object(
     ''pipelineImageId'',i.pipeline_image_id,''generationContractHash'',v_hash,
     ''subject'',coalesce(v_contract->>''subject'',v_contract->>''inspection_target'',case when jsonb_typeof(v_contract->''must_show'')=''array'' and jsonb_array_length(v_contract->''must_show'')>0 then v_contract->''must_show''->>0 end),
     ''sceneDescription'',coalesce(v_contract->''scene''->>''description'',v_contract->>''visual_objective''),''compositionPlan'',v_contract->''composition_plan'',
     ''mustShow'',coalesce(v_contract->''must_show'',''[]''::jsonb),''mustNotShow'',coalesce(v_contract->''must_not_show'',''[]''::jsonb),''peopleMode'',coalesce(v_contract->>''people_mode'',''NONE''),
     ''annotationContract'',v_contract->''annotation_contract'',''mobileRequirement'',v_contract->>''mobile_requirement'',''qaCoreRequired'',coalesce(v_contract->''pixel_qa_contract''->''required_visible'',''[]''::jsonb),''semanticObjectiveIsGate'',false,
     ''runtimePolicy'',v_policy,''reviewRequirements'',v_review
   ));
 end if;
 update public."18_content_pipeline" set stage=''VISUAL'',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage=''DRAFTED'';
 update public."21_content_pipeline_image" set visual_phase=''REVIEWING'',status=''PROCESSING'',handoff_phase=''PRODUCING'',upload_request_id=null,upload_dispatched_at=null,claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval ''60 minutes'',attempt_count=attempt_count+1,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now() where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata)
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,''RUNNING'',jsonb_build_object(''generationContractHash'',v_hash,''generationContract'',v_contract,''runtimePolicy'',v_policy,''reviewRequirements'',v_review,''nativeGenerationIsolationPolicy'',v_isolation,''nativeGenerationContext'',v_native_context,''claimOrder'',''RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING'',''claimTtlMinutes'',60,''contractSource'',case when v_version>=5 then ''STAGE2_V5_SEMANTIC'' else ''STAGE2_V4_IMMUTABLE'' end)) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>''contractHash''=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval ''60 minutes'' where handoff_id=(i.staging_input->>''handoffId'')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object(''executionRole'',''REVIEWER'',''reviewCandidate'',i.review_candidate,''pipelineImageId'',i.pipeline_image_id,''pipelineImageRunId'',v_run,''claimToken'',v_token,''pipelineId'',i.pipeline_id,''contentKey'',p.content_key,''topicKey'',p.topic_key,''imageId'',i.image_id,''assetKey'',i.asset_key,''ordinal'',i.ordinal,''attemptNo'',i.attempt_count,''generationContract'',v_contract,''generationContractHash'',v_hash,''runtimePolicy'',v_policy,''reviewRequirements'',v_review,''nativeGenerationIsolationPolicy'',v_isolation,''nativeGenerationContext'',v_native_context,''claimExpiresAt'',i.claim_expires_at,''preservedStagingInput'',case when i.staging_input->>''contractHash''=v_hash then i.staging_input else null end);
end
$function$
' then raise exception 'VISUAL_SIMPLIFICATION_BASELINE_DRIFT'; end if; end $guard$;

CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_reviewer_v1(p_worker_key text, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype;
 v_token uuid:=extensions.gen_random_uuid(); v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text; v_isolation jsonb; v_native_context jsonb;
 v_policy jsonb; v_review jsonb; v_version int;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_WORKER_KEY'; end if;
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id
 where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL')
   and (p_pipeline_image_id is null or i0.pipeline_image_id=p_pipeline_image_id)
   and i0.visual_phase in ('QA_PENDING','REVIEWING')
   and exists(select 1 from public."27_content_pipeline_source_stage_job" own where own.job_id=(i0.review_candidate->>'jobId')::uuid and own.spec->'visualMcpOperation'->>'workerKey'=p_worker_key)
   and public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,(i0.review_candidate->>'jobId')::uuid) is not null
   and not exists(select 1 from public."27_content_pipeline_source_stage_job" running where running.pipeline_image_id=i0.pipeline_image_id and running.status in ('PENDING','RUNNING'))
   and i0.status in ('PENDING','RETRY','PROCESSING') and i0.staging_asset is null
   and i0.generation_contract is not null and i0.generation_contract_hash is not null
   and (coalesce((i0.generation_contract->>'contract_version')::int,3)<4
        or (coalesce((i0.generation_contract->>'contract_version')::int,3)=4 and i0.generation_contract->'production_feasibility'->>'status'='PASS')
        or (i0.generation_contract->'contract_version'='5'::jsonb and public.content_pipeline_validate_visual_contract_v5(i0.generation_contract,true)->>'status'='PASS'))
   and not (i0.status='RETRY' and coalesce(i0.next_eligible_at,'-infinity'::timestamptz)>now())
   and not (i0.status='PROCESSING' and i0.claim_expires_at>=now())
 order by case when public.content_pipeline_visual_recovery_v1(i0.pipeline_image_id) is not null then 0
 when i0.staging_input->>'contractHash'=i0.generation_contract_hash and exists (
 select 1 from public."25_content_pipeline_generated_asset_handoff" h where h.handoff_id::text=i0.staging_input->>'handoffId' and h.pipeline_image_id=i0.pipeline_image_id and h.consumed_at is null) then 1
 when i0.status in ('RETRY','PROCESSING') then 2 else 3 end,
 t0.priority,t0.content_topic_id,p0.pipeline_id,i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 v_old_token:=i.claim_token;
 if i.status='PROCESSING' and i.claim_expires_at<now() and v_old_token is not null then
  update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_EXPIRED',error='Image claim TTL expired before Complete/Fail RPC.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reclaimedAt',now()) where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status='RUNNING';
 end if;
 v_contract:=i.generation_contract; v_hash:=i.generation_contract_hash; v_version:=coalesce((v_contract->>'contract_version')::int,4);
 if encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex')<>v_hash then raise exception 'CONTENT_PIPELINE_CONTRACT_HASH_MISMATCH'; end if;
 v_policy:=public.content_pipeline_visual_contract_policy_v1(v_contract);
 v_review:=public.content_pipeline_visual_review_requirements_v1(v_contract);
 v_isolation:=jsonb_build_object('mode','FRESH_TASK_ONLY','numLastImagesToInclude',0,'allowPreviousTaskImages',false,'allowPreviousTaskPrompt',false,'referenceImagesScope','CURRENT_PIPELINE_IMAGE_ONLY','isolationKey',i.pipeline_image_id::text||':'||v_hash,'onIsolationMismatch','REGENERATE_WITH_FRESH_CONTEXT_ONCE_THEN_RETRY');
 if v_version>=5 then
   v_native_context:=jsonb_strip_nulls(jsonb_build_object(
     'pipelineImageId',i.pipeline_image_id,'generationContractHash',v_hash,
     'subject',case when jsonb_typeof(v_contract->'must_show')='array' and jsonb_array_length(v_contract->'must_show')>0 then v_contract->'must_show'->>0 end,
     'sceneDescription',v_contract->>'visual_objective','mustShow',coalesce(v_contract->'must_show','[]'::jsonb),'mustNotShow',coalesce(v_contract->'must_not_show','[]'::jsonb),
     'peopleMode',v_policy->>'peoplePolicy','mobileRequirement',v_review->>'mobileRule','qaCoreRequired',coalesce(v_contract->'must_show','[]'::jsonb),'semanticObjectiveIsGate',false,
     'runtimePolicy',v_policy,'reviewRequirements',v_review
   ));
 else
   v_native_context:=jsonb_strip_nulls(jsonb_build_object(
     'pipelineImageId',i.pipeline_image_id,'generationContractHash',v_hash,
     'subject',coalesce(v_contract->>'subject',v_contract->>'inspection_target',case when jsonb_typeof(v_contract->'must_show')='array' and jsonb_array_length(v_contract->'must_show')>0 then v_contract->'must_show'->>0 end),
     'sceneDescription',coalesce(v_contract->'scene'->>'description',v_contract->>'visual_objective'),'compositionPlan',v_contract->'composition_plan',
     'mustShow',coalesce(v_contract->'must_show','[]'::jsonb),'mustNotShow',coalesce(v_contract->'must_not_show','[]'::jsonb),'peopleMode',coalesce(v_contract->>'people_mode','NONE'),
     'annotationContract',v_contract->'annotation_contract','mobileRequirement',v_contract->>'mobile_requirement','qaCoreRequired',coalesce(v_contract->'pixel_qa_contract'->'required_visible','[]'::jsonb),'semanticObjectiveIsGate',false,
     'runtimePolicy',v_policy,'reviewRequirements',v_review
   ));
 end if;
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage='DRAFTED';
 update public."21_content_pipeline_image" set visual_phase='REVIEWING',status='PROCESSING',handoff_phase='PRODUCING',upload_request_id=null,upload_dispatched_at=null,claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval '60 minutes',attempt_count=attempt_count+1,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now() where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata)
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('executionRole','REVIEWER','generationContractHash',v_hash,'generationContract',v_contract,'claimOrder','RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING','claimTtlMinutes',60,'contractSource',case when v_version>=5 then 'STAGE2_V5_SEMANTIC' else 'STAGE2_V4_IMMUTABLE' end)) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes' where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('executionRole','REVIEWER','reviewCandidate',i.review_candidate,'pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'runtimePolicy',v_policy,'reviewRequirements',v_review,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end
$function$;

do $guard$ begin if pg_get_functiondef('public.content_pipeline_visual_claim_request_status_v1(text,uuid)'::regprocedure) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_visual_claim_request_status_v1(p_worker_key text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
declare r public."29_content_pipeline_visual_claim_request"%rowtype;
 i public."21_content_pipeline_image"%rowtype; active boolean; owns boolean; recovery jsonb; production_recovery jsonb; role text; candidate jsonb; native_input jsonb;
begin
 select * into r from public."29_content_pipeline_visual_claim_request"
 where worker_key=p_worker_key and request_id=p_request_id;
 if not found then return jsonb_build_object(''requestId'',p_request_id,''result'',''NOT_FOUND'',''activeClaim'',false);end if;
 if r.pipeline_image_id is null then return jsonb_build_object(''requestId'',p_request_id,''result'',''SKIP'',''claim'',null,''activeClaim'',false);end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=r.pipeline_image_id;
 -- Fence historical Resume aliases too: only the first receipt for this token owns it.
 select request_id=p_request_id into owns from public."29_content_pipeline_visual_claim_request"
 where worker_key=p_worker_key and pipeline_image_id=r.pipeline_image_id
   and response->>''claimToken''=r.response->>''claimToken''
 order by created_at,request_id limit 1;
 active:=coalesce(owns,false) and i.status=''PROCESSING''
   and i.handoff_phase in (''PRODUCING'',''STAGING'') and i.claimed_by=p_worker_key
   and i.claim_token::text=r.response->>''claimToken'' and i.claim_expires_at>now();
 role:=coalesce(r.response->>''executionRole'',''LEGACY'');
 candidate:=public.content_pipeline_review_candidate_v1(i.pipeline_image_id,(i.review_candidate->>''jobId'')::uuid);
 production_recovery:=public.content_pipeline_owned_visual_candidate_v1(p_worker_key,i.pipeline_image_id);
 recovery:=public.content_pipeline_owned_visual_recovery_v1(p_worker_key,i.pipeline_image_id);
 if role<>''REVIEWER'' then native_input:=public.content_pipeline_owned_native_input_v1(p_worker_key,i.pipeline_image_id);end if;
 -- Reviewer recovery must satisfy the same parent/worker fence as final approval.
 if role=''REVIEWER'' and recovery is not null and not exists(
 select 1 from public."27_content_pipeline_source_stage_job" j
 where j.job_id::text=recovery->>''jobId''
 and (j.job_id::text=candidate->>''jobId'' or
 (j.spec->''visualMcpOperation''->>''workerKey''=p_worker_key
 and j.spec->''preStagingQa''->>''sourceJobId''=candidate->>''jobId''
 and j.spec->''preStagingQa''->>''sourceSha256''=candidate->>''sourceSha256''))) then
 recovery:=null;
 end if;
 return jsonb_build_object(''requestId'',p_request_id,
   ''result'',case when active then ''CLAIMED'' when i.status=''PROCESSING'' and not coalesce(owns,false) then ''CLAIM_NOT_OWNED''
     when i.status=''PROCESSING'' then ''CLAIM_INACTIVE'' else ''CLOSED'' end,
   ''executionRole'',role,''visualPhase'',i.visual_phase,''reviewCandidate'',candidate,''recoverableProductionCandidate'',production_recovery,''status'',i.status,''handoffPhase'',i.handoff_phase,''claimExpiresAt'',i.claim_expires_at,
   ''activeClaim'',coalesce(active,false),''failureStage'',i.failure_stage,''failureCode'',i.failure_code,
   ''lastError'',i.last_error,''updatedAt'',i.updated_at,''nextEligibleAt'',i.next_eligible_at,
   ''recoverableNativeInput'',native_input,''recoverableStaging'',recovery,''resumeFrom'',case when role=''PRODUCER'' and production_recovery is not null then ''PRODUCTION_HANDOFF'' when role=''REVIEWER'' and recovery is not null then ''STAGED_INSPECTION'' when role=''REVIEWER'' and candidate is not null then ''REVIEW_CANDIDATE_INSPECTION'' when role=''REVIEWER'' then null when native_input is not null then ''SOURCE_STAGE'' else ''SOURCE_SELECTION'' end,''nextAction'',case when not coalesce(active,false) then case when i.status in (''PENDING'',''RETRY'',''PROCESSING'') and ((role=''PRODUCER'' and i.visual_phase in (''PRODUCTION_PENDING'',''PRODUCING'')) or (role=''REVIEWER'' and candidate is not null) or role=''LEGACY'') then ''RECLAIM_OWN_ROLE_BEFORE_WRITE'' else ''FOLLOW_TASK_STATUS'' end when role=''PRODUCER'' and production_recovery is not null then ''HANDOFF_EXISTING_PRODUCTION_CANDIDATE'' when role=''REVIEWER'' and recovery is not null then ''INSPECT_EXISTING_STAGED_JOB'' when role=''REVIEWER'' and candidate is not null then ''INSPECT_REVIEW_CANDIDATE'' when role=''REVIEWER'' then ''FOLLOW_TASK_STATUS'' when recovery->>''approved''=''true'' then ''FOLLOW_TASK_STATUS'' when recovery is not null then ''INSPECT_EXISTING_STAGED_JOB'' when native_input is not null then ''RESUME_PRESERVED_NATIVE_INPUT'' else ''SELECT_SOURCE_OR_NATIVE_FILE'' end,
   ''claim'',case when active then r.response||jsonb_build_object(''recoverableStaging'',recovery,''recoverableProductionCandidate'',production_recovery,''reviewCandidate'',candidate,''recoverableNativeInput'',native_input) else r.response-''claimToken'' end);
end $function$
' then raise exception 'VISUAL_SIMPLIFICATION_BASELINE_DRIFT'; end if; end $guard$;

CREATE OR REPLACE FUNCTION public.content_pipeline_visual_claim_request_status_v1(p_worker_key text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public."29_content_pipeline_visual_claim_request"%rowtype;
 i public."21_content_pipeline_image"%rowtype; active boolean; owns boolean; recovery jsonb; production_recovery jsonb; role text; candidate jsonb; native_input jsonb; derived jsonb; frozen jsonb; pol jsonb; reqs jsonb;
begin
 select * into r from public."29_content_pipeline_visual_claim_request"
 where worker_key=p_worker_key and request_id=p_request_id;
 if not found then return jsonb_build_object('requestId',p_request_id,'result','NOT_FOUND','activeClaim',false);end if;
 if r.pipeline_image_id is null then return jsonb_build_object('requestId',p_request_id,'result','SKIP','claim',null,'activeClaim',false);end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=r.pipeline_image_id;
 -- Fence historical Resume aliases too: only the first receipt for this token owns it.
 select request_id=p_request_id into owns from public."29_content_pipeline_visual_claim_request"
 where worker_key=p_worker_key and pipeline_image_id=r.pipeline_image_id
   and response->>'claimToken'=r.response->>'claimToken'
 order by created_at,request_id limit 1;
 active:=coalesce(owns,false) and i.status='PROCESSING'
   and i.handoff_phase in ('PRODUCING','STAGING') and i.claimed_by=p_worker_key
   and i.claim_token::text=r.response->>'claimToken' and i.claim_expires_at>now();
 role:=coalesce(r.response->>'executionRole','LEGACY');
 frozen:=r.response->'generationContract';
 if frozen is not null then
  pol:=public.content_pipeline_visual_contract_policy_v1(frozen);
  reqs:=public.content_pipeline_visual_review_requirements_v1(frozen);
  derived:=jsonb_build_object('runtimePolicy',pol,'reviewRequirements',reqs,
   'nativeGenerationIsolationPolicy',jsonb_build_object('mode','FRESH_TASK_ONLY','numLastImagesToInclude',0,'allowPreviousTaskImages',false,'allowPreviousTaskPrompt',false,'referenceImagesScope','CURRENT_PIPELINE_IMAGE_ONLY','isolationKey',i.pipeline_image_id::text||':'||(r.response->>'generationContractHash'),'onIsolationMismatch','REGENERATE_WITH_FRESH_CONTEXT_ONCE_THEN_RETRY'),
   'nativeGenerationContext',jsonb_strip_nulls(jsonb_build_object('pipelineImageId',i.pipeline_image_id,'generationContractHash',r.response->>'generationContractHash','subject',coalesce(frozen->>'subject',frozen->>'inspection_target',frozen->'must_show'->>0),'sceneDescription',coalesce(frozen->'scene'->>'description',frozen->>'visual_objective'),'mustShow',coalesce(frozen->'must_show','[]'::jsonb),'mustNotShow',coalesce(frozen->'must_not_show','[]'::jsonb),'compositionPlan',frozen->'composition_plan','annotationContract',frozen->'annotation_contract','peopleMode',case when frozen->'contract_version'='5'::jsonb then pol->>'peoplePolicy' else coalesce(frozen->>'people_mode','NONE') end,'mobileRequirement',case when frozen->'contract_version'='5'::jsonb then reqs->>'mobileRule' else frozen->>'mobile_requirement' end,'qaCoreRequired',case when frozen->'contract_version'='5'::jsonb then coalesce(frozen->'must_show','[]'::jsonb) else coalesce(frozen->'pixel_qa_contract'->'required_visible','[]'::jsonb) end,'semanticObjectiveIsGate',false,'runtimePolicy',pol,'reviewRequirements',reqs)),
   'preservedStagingInput',case when i.staging_input->>'contractHash'=r.response->>'generationContractHash' then i.staging_input else null end);
  -- Historical snapshots win; only missing computed fields are hydrated.
  r.response:=derived||r.response;
 end if;

 candidate:=public.content_pipeline_review_candidate_v1(i.pipeline_image_id,(i.review_candidate->>'jobId')::uuid);
 production_recovery:=public.content_pipeline_owned_visual_candidate_v1(p_worker_key,i.pipeline_image_id);
 recovery:=public.content_pipeline_owned_visual_recovery_v1(p_worker_key,i.pipeline_image_id);
 if role<>'REVIEWER' then native_input:=public.content_pipeline_owned_native_input_v1(p_worker_key,i.pipeline_image_id);end if;
 -- Reviewer recovery must satisfy the same parent/worker fence as final approval.
 if role='REVIEWER' and recovery is not null and not exists(
 select 1 from public."27_content_pipeline_source_stage_job" j
 where j.job_id::text=recovery->>'jobId'
 and (j.job_id::text=candidate->>'jobId' or
 (j.spec->'visualMcpOperation'->>'workerKey'=p_worker_key
 and j.spec->'preStagingQa'->>'sourceJobId'=candidate->>'jobId'
 and j.spec->'preStagingQa'->>'sourceSha256'=candidate->>'sourceSha256'))) then
 recovery:=null;
 end if;
 return jsonb_build_object('requestId',p_request_id,
   'result',case when active then 'CLAIMED' when i.status='PROCESSING' and not coalesce(owns,false) then 'CLAIM_NOT_OWNED'
     when i.status='PROCESSING' then 'CLAIM_INACTIVE' else 'CLOSED' end,
   'executionRole',role,'visualPhase',i.visual_phase,'reviewCandidate',candidate,'recoverableProductionCandidate',production_recovery,'status',i.status,'handoffPhase',i.handoff_phase,'claimExpiresAt',i.claim_expires_at,
   'activeClaim',coalesce(active,false),'failureStage',i.failure_stage,'failureCode',i.failure_code,
   'lastError',i.last_error,'updatedAt',i.updated_at,'nextEligibleAt',i.next_eligible_at,
   'recoverableNativeInput',native_input,'recoverableStaging',recovery,'resumeFrom',case when role='PRODUCER' and production_recovery is not null then 'PRODUCTION_HANDOFF' when role='REVIEWER' and recovery is not null then 'STAGED_INSPECTION' when role='REVIEWER' and candidate is not null then 'REVIEW_CANDIDATE_INSPECTION' when role='REVIEWER' then null when native_input is not null then 'SOURCE_STAGE' else 'SOURCE_SELECTION' end,'nextAction',case when not coalesce(active,false) then case when i.status in ('PENDING','RETRY','PROCESSING') and ((role='PRODUCER' and i.visual_phase in ('PRODUCTION_PENDING','PRODUCING')) or (role='REVIEWER' and candidate is not null) or role='LEGACY') then 'RECLAIM_OWN_ROLE_BEFORE_WRITE' else 'FOLLOW_TASK_STATUS' end when role='PRODUCER' and production_recovery is not null then 'HANDOFF_EXISTING_PRODUCTION_CANDIDATE' when role='REVIEWER' and recovery is not null then 'INSPECT_EXISTING_STAGED_JOB' when role='REVIEWER' and candidate is not null then 'INSPECT_REVIEW_CANDIDATE' when role='REVIEWER' then 'FOLLOW_TASK_STATUS' when recovery->>'approved'='true' then 'FOLLOW_TASK_STATUS' when recovery is not null then 'INSPECT_EXISTING_STAGED_JOB' when native_input is not null then 'RESUME_PRESERVED_NATIVE_INPUT' else 'SELECT_SOURCE_OR_NATIVE_FILE' end,
   'claim',case when active then r.response||jsonb_build_object('recoverableStaging',recovery,'recoverableProductionCandidate',production_recovery,'reviewCandidate',candidate,'recoverableNativeInput',native_input) else r.response-'claimToken' end);
end $function$;
