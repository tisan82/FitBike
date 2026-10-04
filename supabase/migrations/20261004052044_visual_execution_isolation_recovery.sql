-- Recovery receipts remain in the existing source-stage job table; staging_asset
-- continues to mean QA-approved 3-B input. Never promote an uninspected job.
create or replace function public.content_pipeline_visual_recovery_v1(p_pipeline_image_id bigint)
returns jsonb language sql stable security definer set search_path to '' as $function$
 select jsonb_build_object('jobId',j.job_id,'sha256',j.result->>'sha256',
   'canonicalPath',j.result->>'path','bucket',j.result->>'bucket','contractHash',j.contract_hash,
   'bytes',j.result->'bytes','width',j.result->'width','height',j.result->'height',
   'approved',j.approved_at is not null,'createdAt',j.created_at,
   'resumeFrom','INSPECTION','storagePresent',true)
 from public."27_content_pipeline_source_stage_job" j
 join public."21_content_pipeline_image" i on i.pipeline_image_id=j.pipeline_image_id
 join storage.objects o on o.bucket_id='content-pipeline-staging' and o.name=j.result->>'path'
 where i.pipeline_image_id=p_pipeline_image_id and j.status='STAGED'
   and j.contract_hash=i.generation_contract_hash
   and (j.approved_at is null or i.staging_asset->>'sourceJobId'=j.job_id::text)
   and j.result->>'bucket'='content-pipeline-staging'
   and j.result->>'sha256' ~ '^[a-f0-9]{64}$'
   and j.result->>'path'=i.pipeline_id::text||'/'||i.pipeline_image_id::text||'/'||(j.result->>'sha256')||'.webp'
 order by (j.approved_at is not null) desc,j.created_at desc,j.job_id limit 1
$function$;
revoke all on function public.content_pipeline_visual_recovery_v1(bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_visual_recovery_v1(bigint) to service_role;

create or replace function public.content_pipeline_visual_claim_request_status_v1(p_worker_key text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare r public."29_content_pipeline_visual_claim_request"%rowtype;
 i public."21_content_pipeline_image"%rowtype; active boolean; owns boolean; recovery jsonb;
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
 recovery:=public.content_pipeline_visual_recovery_v1(i.pipeline_image_id);
 return jsonb_build_object('requestId',p_request_id,
   'result',case when active then 'CLAIMED' when i.status='PROCESSING' and not coalesce(owns,false) then 'CLAIM_NOT_OWNED'
     when i.status='PROCESSING' then 'CLAIM_INACTIVE' else 'CLOSED' end,
   'status',i.status,'handoffPhase',i.handoff_phase,'claimExpiresAt',i.claim_expires_at,
   'activeClaim',coalesce(active,false),'failureStage',i.failure_stage,'failureCode',i.failure_code,
   'lastError',i.last_error,'updatedAt',i.updated_at,'nextEligibleAt',i.next_eligible_at,
   'recoverableStaging',recovery,'nextAction',case when recovery->>'approved'='true' then 'FOLLOW_TASK_STATUS' when recovery is not null then 'INSPECT_EXISTING_STAGED_JOB' else 'SELECT_SOURCE_OR_NATIVE_FILE' end,
   'claim',case when active then r.response||jsonb_build_object('recoverableStaging',recovery) else r.response-'claimToken' end);
end $function$;

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

  -- A new execution must never acquire another execution's active lease.
  -- The same requestId remains the only automatic lost-response resume path.
  if exists(select 1 from public."21_content_pipeline_image"
    where claimed_by=p_worker_key and status='PROCESSING' and claim_expires_at>now()) then
    return jsonb_build_object('requestId',p_request_id,'result','BUSY',
      'activeClaim',false,'claim',null,'reason','ANOTHER_EXECUTION_OWNS_ACTIVE_CLAIM',
      'nextAction','WAIT_FOR_OWNER_OR_REPLAY_OWN_REQUEST');
  end if;
  response:=public.content_pipeline_claim_visual_producer_v1(p_worker_key,p_pipeline_image_id);

  insert into public."29_content_pipeline_visual_claim_request"
    (worker_key,request_id,target_image_id,pipeline_image_id,response)
  values(
    p_worker_key,
    p_request_id,
    p_pipeline_image_id,
    (response->>'pipelineImageId')::bigint,
    response
  );

  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)
    || jsonb_build_object('replayed',false);
end
$function$

;

-- Mutation wrappers recheck execution ownership under the image lock, so a
-- cached preflight cannot authorize a later close/approval after lease changes.
create or replace function public.content_pipeline_fail_visual_request_v1(
 p_worker_key text,p_request_id uuid,p_status text,p_stage text,p_code text,p_error text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare c jsonb; v_image_id bigint; recovery jsonb;
begin
 select pipeline_image_id into v_image_id from public."29_content_pipeline_visual_claim_request"
 where worker_key=p_worker_key and request_id=p_request_id;
 perform 1 from public."21_content_pipeline_image" where pipeline_image_id=v_image_id for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 if p_status not in ('RETRY','HOLD') then raise exception 'INVALID_FAILURE_STATUS';end if;
 recovery:=public.content_pipeline_visual_recovery_v1(v_image_id);
 perform public.content_pipeline_fail_image_v1(
   p_pipeline_image_id=>v_image_id,p_pipeline_image_run_id=>(c->'claim'->>'pipelineImageRunId')::bigint,
   p_claim_token=>(c->'claim'->>'claimToken')::uuid,p_failure_status=>p_status,
   p_failure_stage=>p_stage,p_failure_code=>p_code,p_error=>p_error,
   p_retry_action=>case when recovery is not null then 'RESUME_STAGED_INSPECTION' else 'RESUME_LAST_SUCCESSFUL_STAGE' end,
   p_metadata=>jsonb_build_object('transport','VISUAL_MCP','requestId',p_request_id,'recoverableStaging',recovery));
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
end $function$;
revoke all on function public.content_pipeline_fail_visual_request_v1(text,uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_fail_visual_request_v1(text,uuid,text,text,text,text) to service_role;

create or replace function public.content_pipeline_approve_visual_request_v1(
 p_worker_key text,p_request_id uuid,p_job_id uuid,p_expected_sha text,p_qa jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $function$
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
 return public.content_pipeline_approve_source_stage_v1(p_job_id,(c->'claim'->>'claimToken')::uuid,p_expected_sha,p_qa);
end $function$;
revoke all on function public.content_pipeline_approve_visual_request_v1(text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_approve_visual_request_v1(text,uuid,uuid,text,jsonb) to service_role;
