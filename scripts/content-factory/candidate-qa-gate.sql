begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $gate_deploy$
begin
 perform pg_advisory_xact_lock(hashtextextended('fitbike-visual-delivery-release',0));
 if md5(pg_get_functiondef('public.content_pipeline_approve_visual_request_v1(text,uuid,uuid,text,jsonb)'::regprocedure)) <> '8c097b7dce6ac4da3b34fc74542a9e2f' and (select prosrc from pg_proc where oid='public.content_pipeline_approve_visual_request_v1(text,uuid,uuid,text,jsonb)'::regprocedure) is distinct from '
declare c jsonb; v_image_id bigint;
begin
 -- Match the existing approval lock order: job then image.
 perform 1 from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 select pipeline_image_id into v_image_id from public."29_content_pipeline_visual_claim_request"
 where worker_key=p_worker_key and request_id=p_request_id;
 perform 1 from public."21_content_pipeline_image" where pipeline_image_id=v_image_id for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>''activeClaim'' is distinct from ''true'' then raise exception ''ACTIVE_VISUAL_CLAIM_REQUIRED'';end if;
 if not exists(select 1 from public."27_content_pipeline_source_stage_job"
   where job_id=p_job_id and pipeline_image_id=v_image_id and contract_hash=c->''claim''->>''generationContractHash'')
 then raise exception ''SOURCE_JOB_ACCESS_DENIED'';end if;
 -- CANDIDATE_QA_GATE_V2: environment health never substitutes for this candidate''s pixels.
 if c->''claim''->>''deliveryRuntime'' is not null then
  perform public.content_pipeline_require_visual_pixel_report_v1(p_worker_key,p_request_id,p_job_id,p_expected_sha,c->''claim''->>''deliveryRuntime'');
 end if;
 return public.content_pipeline_approve_source_stage_v1(p_job_id,(c->''claim''->>''claimToken'')::uuid,p_expected_sha,p_qa);
end ' then raise exception 'QA_GATE_DEFINITION_DRIFT';end if;
 if md5(pg_get_functiondef('public.content_pipeline_handoff_visual_review_v1(text,uuid,uuid,text)'::regprocedure)) <> '28af2993f183cf55bdf7e00c3465a17a' and (select prosrc from pg_proc where oid='public.content_pipeline_handoff_visual_review_v1(text,uuid,uuid,text)'::regprocedure) is distinct from '
declare r public."29_content_pipeline_visual_claim_request"%rowtype;i public."21_content_pipeline_image"%rowtype;c jsonb;candidate jsonb;j public."27_content_pipeline_source_stage_job"%rowtype;
begin
 perform 1 from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 select * into r from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=r.pipeline_image_id for update;
 if r.response->>''executionRole'' is distinct from ''PRODUCER'' then raise exception ''PRODUCER_REQUEST_REQUIRED'';end if;
 -- Replay only this exact, previously completed handoff; never touches a subsequent review Claim.
 if exists(select 1 from public."23_content_pipeline_image_run" where claim_token=(r.response->>''claimToken'')::uuid and pipeline_image_id=i.pipeline_image_id and metadata->''reviewHandoff''->>''jobId''=p_job_id::text and metadata->''reviewHandoff''->>''sha256''=p_expected_sha) then
  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object(''handoffCompleted'',true,''replayed'',true,''jobId'',p_job_id,''historicalHandoffPhase'',''QA_PENDING'');end if;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>''activeClaim'' is distinct from ''true'' then raise exception ''ACTIVE_VISUAL_CLAIM_REQUIRED'';end if;
 candidate:=public.content_pipeline_review_candidate_v1(i.pipeline_image_id,p_job_id);
 if candidate is null or candidate->>''sha256'' is distinct from p_expected_sha or candidate->>''contractHash'' is distinct from r.response->>''generationContractHash''
 or not exists(select 1 from public."27_content_pipeline_source_stage_job" where job_id=p_job_id and spec->''visualMcpOperation''->>''workerKey''=p_worker_key) then raise exception ''REVIEW_CANDIDATE_INVALID'';end if;

 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id;
 if public.content_pipeline_duplicate_source_id_v1(i.pipeline_image_id,j.spec,
    coalesce(j.result->>''preStagingSourceSha256'',j.result->''provenance''->>''sourceSha256'')) is not null then
  return public.content_pipeline_return_duplicate_visual_candidate_v1(p_worker_key,p_request_id,p_job_id,p_expected_sha);
 end if;
 -- CANDIDATE_QA_GATE_V2: environment health never substitutes for this candidate''s pixels.
 if c->''claim''->>''deliveryRuntime'' is not null then
  perform public.content_pipeline_require_visual_pixel_report_v1(p_worker_key,p_request_id,p_job_id,p_expected_sha,c->''claim''->>''deliveryRuntime'');
 end if;
 if exists(select 1 from public."27_content_pipeline_source_stage_job" where pipeline_image_id=i.pipeline_image_id and status in (''PENDING'',''RUNNING'')) then raise exception ''VISUAL_CANDIDATE_ALREADY_RUNNING'';end if;
 update public."23_content_pipeline_image_run" set status=''PASS'',summary=''3-A production stored; QA NOT_EVALUATED'',completed_at=now(),
 metadata=coalesce(metadata,''{}''::jsonb)||jsonb_build_object(''executionRole'',''PRODUCER'',''reviewHandoff'',candidate)
 where pipeline_image_run_id=(r.response->>''pipelineImageRunId'')::bigint and claim_token=i.claim_token and status=''RUNNING'';
 if not found then raise exception ''IMAGE_RUN_MISSING'';end if;
 update public."21_content_pipeline_image" set status=''PENDING'',visual_phase=''QA_PENDING'',review_candidate=candidate,
 handoff_phase=null,claimed_by=null,claim_token=null,claimed_at=null,claim_expires_at=null,next_eligible_at=null,
 retry_action=''INSPECT_REVIEW_CANDIDATE'',updated_at=now() where pipeline_image_id=i.pipeline_image_id;
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object(''handoffCompleted'',true,''approvalPerformed'',false,''reviewCandidate'',candidate);
end ' then raise exception 'QA_GATE_DEFINITION_DRIFT';end if;
 if md5(pg_get_functiondef('public.content_pipeline_record_visual_delivery_v1(text,jsonb,boolean)'::regprocedure)) <> '67ed4497e655c25ef8ef6d72d61d9d36' and (select prosrc from pg_proc where oid='public.content_pipeline_record_visual_delivery_v1(text,jsonb,boolean)'::regprocedure) is distinct from '
declare v_id uuid; v_probe uuid; v_request uuid; v_job uuid; v_sha text; v_scope text; v_runtime text; v_stage text; v_outcome text; v_view text; v_image bigint; v_hash text; v_role text; v_current jsonb; v_evidence text; v_replay boolean; v_existing public.content_pipeline_visual_delivery_event%rowtype; v_new public.content_pipeline_visual_delivery_event%rowtype;
begin
  if p_server is null then raise exception ''INVALID_DELIVERY_EVENT''; end if;
  if jsonb_typeof(p_event) is distinct from ''object'' or exists(select 1 from jsonb_object_keys(p_event) k where k not in (''eventId'',''probeId'',''requestId'',''jobId'',''expectedSha'',''scope'',''runtime'',''stage'',''outcome'',''code'',''view'',''pixelsInspected'',''pixelQa'',''evidence'',''traceId'',''responseBytes'',''elapsedMs'')) then raise exception ''DELIVERY_REQUEST_INVALID''; end if;
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
    -- CANDIDATE_QA_GATE_V2: serialize observations with handoff/approval.
    perform 1 from public."27_content_pipeline_source_stage_job" where job_id=v_job for update;
    select pipeline_image_id into v_image from public."27_content_pipeline_source_stage_job" where job_id=v_job;
    perform 1 from public."21_content_pipeline_image" where pipeline_image_id=v_image for update;
    v_current:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,v_request);
    if v_current->''claim'' is null or v_current->>''activeClaim'' is distinct from ''true'' then raise exception ''VISUAL_CLAIM_RECEIPT_REQUIRED''; end if;
    if v_current->''claim''->>''deliveryRuntime'' is not null and v_current->''claim''->>''deliveryRuntime'' is distinct from v_runtime then raise exception ''INVALID_DELIVERY_RUNTIME''; end if;
    v_image:=(v_current->''claim''->>''pipelineImageId'')::bigint; v_hash:=v_current->''claim''->>''generationContractHash''; v_role:=coalesce(v_current->''claim''->>''executionRole'',''LEGACY'');
    if not exists(select 1 from public."27_content_pipeline_source_stage_job" j join public."21_content_pipeline_image" i on i.pipeline_image_id=j.pipeline_image_id where j.job_id=v_job and j.spec->''visualMcpOperation''->>''workerKey''=p_worker_key and j.pipeline_image_id=v_image and j.contract_hash=v_hash and i.generation_contract_hash=v_hash and j.result->>''sha256''=v_sha and j.status=''STAGED'') then raise exception ''SOURCE_JOB_ACCESS_DENIED''; end if;
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
end ' then raise exception 'QA_GATE_DEFINITION_DRIFT';end if;
 if md5(pg_get_functiondef('public.content_pipeline_claim_visual_delivery_v1(text,uuid,text,bigint,text)'::regprocedure)) <> '18e754e1e5833f214479682711837e57' and (select prosrc from pg_proc where oid='public.content_pipeline_claim_visual_delivery_v1(text,uuid,text,bigint,text)'::regprocedure) is distinct from '
declare v_existing jsonb; v_health jsonb; v_result jsonb;
begin
  if p_runtime is null or p_runtime not in (''WORK'',''CHAT'',''SCHEDULED'') then raise exception ''INVALID_DELIVERY_RUNTIME''; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_worker_key||'':delivery-claim:''||p_request_id::text,0));
  select response into v_existing from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
  if found then
    if v_existing->>''deliveryRuntime'' is distinct from p_runtime then raise exception ''VISUAL_REQUEST_INPUT_CONFLICT''; end if;
  else
    begin
      v_health:=public.content_pipeline_visual_delivery_health_v1(p_worker_key,p_runtime);
    exception when others then
      v_health:=jsonb_build_object(''ready'',false,''state'',''UNKNOWN'',''diagnosticCode'',''HEALTH_READ_FAILED'');
    end;
  end if;
  v_result:=public.content_pipeline_claim_visual_stage_v1(p_worker_key,p_request_id,p_role,p_pipeline_image_id);
  update public."29_content_pipeline_visual_claim_request" set response=response||jsonb_build_object(''deliveryRuntime'',p_runtime,''deliveryVersion'',''PIXEL_DELIVERY_V1'',
    ''deliveryClaimPolicy'',''CANDIDATE_QA_GATE_V2'',''environmentProbeRequired'',false,''candidatePixelQaRequired'',true,
    ''environmentObservation'',jsonb_build_object(''ready'',coalesce(v_health->''ready'',''false''::jsonb),''state'',coalesce(v_health->>''state'',''UNKNOWN''),''observedAt'',now())) where worker_key=p_worker_key and request_id=p_request_id and response->>''deliveryRuntime'' is null;
  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
end ' then raise exception 'QA_GATE_DEFINITION_DRIFT';end if;
end $gate_deploy$;
CREATE OR REPLACE FUNCTION public.content_pipeline_approve_visual_request_v1(p_worker_key text, p_request_id uuid, p_job_id uuid, p_expected_sha text, p_qa jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; v_image_id bigint;
begin
 -- Match the existing approval lock order: job then image.
 perform 1 from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 select pipeline_image_id into v_image_id from public."29_content_pipeline_visual_claim_request"
 where worker_key=p_worker_key and request_id=p_request_id;
 perform 1 from public."21_content_pipeline_image" where pipeline_image_id=v_image_id for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 if not exists(select 1 from public."27_content_pipeline_source_stage_job"
   where job_id=p_job_id and pipeline_image_id=v_image_id and contract_hash=c->'claim'->>'generationContractHash')
 then raise exception 'SOURCE_JOB_ACCESS_DENIED';end if;
 -- CANDIDATE_QA_GATE_V2: environment health never substitutes for this candidate's pixels.
 if c->'claim'->>'deliveryRuntime' is not null then
  perform public.content_pipeline_require_visual_pixel_report_v1(p_worker_key,p_request_id,p_job_id,p_expected_sha,c->'claim'->>'deliveryRuntime');
 end if;
 return public.content_pipeline_approve_source_stage_v1(p_job_id,(c->'claim'->>'claimToken')::uuid,p_expected_sha,p_qa);
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_handoff_visual_review_v1(p_worker_key text, p_request_id uuid, p_job_id uuid, p_expected_sha text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public."29_content_pipeline_visual_claim_request"%rowtype;i public."21_content_pipeline_image"%rowtype;c jsonb;candidate jsonb;j public."27_content_pipeline_source_stage_job"%rowtype;
begin
 perform 1 from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 select * into r from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=r.pipeline_image_id for update;
 if r.response->>'executionRole' is distinct from 'PRODUCER' then raise exception 'PRODUCER_REQUEST_REQUIRED';end if;
 -- Replay only this exact, previously completed handoff; never touches a subsequent review Claim.
 if exists(select 1 from public."23_content_pipeline_image_run" where claim_token=(r.response->>'claimToken')::uuid and pipeline_image_id=i.pipeline_image_id and metadata->'reviewHandoff'->>'jobId'=p_job_id::text and metadata->'reviewHandoff'->>'sha256'=p_expected_sha) then
  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object('handoffCompleted',true,'replayed',true,'jobId',p_job_id,'historicalHandoffPhase','QA_PENDING');end if;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 candidate:=public.content_pipeline_review_candidate_v1(i.pipeline_image_id,p_job_id);
 if candidate is null or candidate->>'sha256' is distinct from p_expected_sha or candidate->>'contractHash' is distinct from r.response->>'generationContractHash'
 or not exists(select 1 from public."27_content_pipeline_source_stage_job" where job_id=p_job_id and spec->'visualMcpOperation'->>'workerKey'=p_worker_key) then raise exception 'REVIEW_CANDIDATE_INVALID';end if;

 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id;
 if public.content_pipeline_duplicate_source_id_v1(i.pipeline_image_id,j.spec,
    coalesce(j.result->>'preStagingSourceSha256',j.result->'provenance'->>'sourceSha256')) is not null then
  return public.content_pipeline_return_duplicate_visual_candidate_v1(p_worker_key,p_request_id,p_job_id,p_expected_sha);
 end if;
 -- CANDIDATE_QA_GATE_V2: environment health never substitutes for this candidate's pixels.
 if c->'claim'->>'deliveryRuntime' is not null then
  perform public.content_pipeline_require_visual_pixel_report_v1(p_worker_key,p_request_id,p_job_id,p_expected_sha,c->'claim'->>'deliveryRuntime');
 end if;
 if exists(select 1 from public."27_content_pipeline_source_stage_job" where pipeline_image_id=i.pipeline_image_id and status in ('PENDING','RUNNING')) then raise exception 'VISUAL_CANDIDATE_ALREADY_RUNNING';end if;
 update public."23_content_pipeline_image_run" set status='PASS',summary='3-A production stored; QA NOT_EVALUATED',completed_at=now(),
 metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('executionRole','PRODUCER','reviewHandoff',candidate)
 where pipeline_image_run_id=(r.response->>'pipelineImageRunId')::bigint and claim_token=i.claim_token and status='RUNNING';
 if not found then raise exception 'IMAGE_RUN_MISSING';end if;
 update public."21_content_pipeline_image" set status='PENDING',visual_phase='QA_PENDING',review_candidate=candidate,
 handoff_phase=null,claimed_by=null,claim_token=null,claimed_at=null,claim_expires_at=null,next_eligible_at=null,
 retry_action='INSPECT_REVIEW_CANDIDATE',updated_at=now() where pipeline_image_id=i.pipeline_image_id;
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object('handoffCompleted',true,'approvalPerformed',false,'reviewCandidate',candidate);
end $function$
;
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
    -- CANDIDATE_QA_GATE_V2: serialize observations with handoff/approval.
    perform 1 from public."27_content_pipeline_source_stage_job" where job_id=v_job for update;
    select pipeline_image_id into v_image from public."27_content_pipeline_source_stage_job" where job_id=v_job;
    perform 1 from public."21_content_pipeline_image" where pipeline_image_id=v_image for update;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_delivery_v1(p_worker_key text, p_request_id uuid, p_role text, p_pipeline_image_id bigint, p_runtime text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v_existing jsonb; v_health jsonb; v_result jsonb;
begin
  if p_runtime is null or p_runtime not in ('WORK','CHAT','SCHEDULED') then raise exception 'INVALID_DELIVERY_RUNTIME'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_worker_key||':delivery-claim:'||p_request_id::text,0));
  select response into v_existing from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
  if found then
    if v_existing->>'deliveryRuntime' is distinct from p_runtime then raise exception 'VISUAL_REQUEST_INPUT_CONFLICT'; end if;
  else
    begin
      v_health:=public.content_pipeline_visual_delivery_health_v1(p_worker_key,p_runtime);
    exception when others then
      v_health:=jsonb_build_object('ready',false,'state','UNKNOWN','diagnosticCode','HEALTH_READ_FAILED');
    end;
  end if;
  v_result:=public.content_pipeline_claim_visual_stage_v1(p_worker_key,p_request_id,p_role,p_pipeline_image_id);
  update public."29_content_pipeline_visual_claim_request" set response=response||jsonb_build_object('deliveryRuntime',p_runtime,'deliveryVersion','PIXEL_DELIVERY_V1',
    'deliveryClaimPolicy','CANDIDATE_QA_GATE_V2','environmentProbeRequired',false,'candidatePixelQaRequired',true,
    'environmentObservation',jsonb_build_object('ready',coalesce(v_health->'ready','false'::jsonb),'state',coalesce(v_health->>'state','UNKNOWN'),'observedAt',now())) where worker_key=p_worker_key and request_id=p_request_id and response->>'deliveryRuntime' is null;
  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
end $function$
;
revoke all on function public.content_pipeline_claim_visual_delivery_v1(text,uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_claim_visual_delivery_v1(text,uuid,text,bigint,text) to service_role;
commit;
