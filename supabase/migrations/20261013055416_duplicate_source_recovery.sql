create or replace function public.content_pipeline_duplicate_source_id_v1(p_image_id bigint,p_spec jsonb,p_source_sha text default null)
returns bigint language sql stable security definer set search_path='' as $fn$
 with candidates as (
  select coalesce(p_spec->>'sourceAssetUrl',p_spec->>'inputAssetUrl') as url,p_source_sha as sha
  union all
  select s->>'sourceAssetUrl',s->>'expectedSourceSha'
  from jsonb_array_elements(case when jsonb_typeof(p_spec->'composition'->'sources')='array' then p_spec->'composition'->'sources' else '[]'::jsonb end) s
 )
 select other.pipeline_image_id from public."21_content_pipeline_image" other
 where other.pipeline_image_id<>p_image_id and other.status in ('READY_FOR_UPLOAD','DONE')
 and exists(select 1 from candidates c where
   other.staging_asset->'qa'->>'sourceAssetUrl'=c.url
   or (c.sha ~ '^[a-f0-9]{64}$' and other.staging_asset->'qa'->'provenance'->>'sourceSha256'=c.sha))
 order by other.pipeline_image_id limit 1
$fn$;
revoke all on function public.content_pipeline_duplicate_source_id_v1(bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_duplicate_source_id_v1(bigint,jsonb,text) to service_role;

create or replace function public.content_pipeline_return_duplicate_visual_candidate_v1(p_worker_key text,p_request_id uuid,p_job_id uuid,p_expected_sha text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare c jsonb;j public."27_content_pipeline_source_stage_job"%rowtype;duplicate_id bigint;candidate jsonb;image_id bigint;
begin
 -- Match existing approval/rejection lock order: job then image.
 perform 1 from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 select pipeline_image_id into image_id from public."29_content_pipeline_visual_claim_request"
 where worker_key=p_worker_key and request_id=p_request_id;
 perform 1 from public."21_content_pipeline_image" where pipeline_image_id=image_id for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 candidate:=public.content_pipeline_review_candidate_v1(image_id,p_job_id);
 if candidate is null or j.pipeline_image_id is distinct from image_id
  or j.spec->'visualMcpOperation'->>'workerKey' is distinct from p_worker_key
  or candidate->>'sha256' is distinct from p_expected_sha
  or j.contract_hash is distinct from c->'claim'->>'generationContractHash'
  or (c->>'executionRole'='REVIEWER' and c->'reviewCandidate'->>'jobId' is distinct from p_job_id::text)
  or c->>'executionRole' not in ('PRODUCER','REVIEWER') then raise exception 'SOURCE_JOB_ACCESS_DENIED';end if;
 duplicate_id:=public.content_pipeline_duplicate_source_id_v1(image_id,j.spec,
  coalesce(j.result->>'preStagingSourceSha256',j.result->'provenance'->>'sourceSha256'));
 if duplicate_id is null then raise exception 'DUPLICATE_SOURCE_NOT_CONFIRMED';end if;
 perform public.content_pipeline_reject_visual_source_v1(p_worker_key,p_request_id,p_job_id,p_expected_sha,
  'SOURCE_MISMATCH','Source reuse blocked by approved image '||duplicate_id::text||'; pixel QA is preserved; select a different source.');
 update public."27_content_pipeline_source_stage_job" set result=result||jsonb_build_object(
  'sourceUsageValidation',jsonb_build_object('status','FAIL','code','DUPLICATE_SOURCE_PREFLIGHT','duplicateImageId',duplicate_id,'checkedAt',now()))
 where job_id=p_job_id;
 -- The rejected job remains stored but cannot be recovered as an eligible candidate.
 perform public.content_pipeline_fail_visual_request_v1(p_worker_key,p_request_id,'RETRY','SOURCE_USAGE_CHECK',
  'DUPLICATE_SOURCE_PREFLIGHT','Approved source reuse is blocked; select a different source.');
 update public."23_content_pipeline_image_run" set metadata=coalesce(metadata,'{}'::jsonb)||
  jsonb_build_object('rejectedCandidate',candidate,'duplicateImageId',duplicate_id,'preservedStagingInput',
    (select staging_input from public."21_content_pipeline_image" where pipeline_image_id=image_id))
 where pipeline_image_run_id=(c->'claim'->>'pipelineImageRunId')::bigint;
 update public."21_content_pipeline_image" set review_candidate=null,visual_phase='PRODUCTION_PENDING',
  retry_action='SELECT_NEW_SOURCE',next_eligible_at=now(),staging_input=null where pipeline_image_id=image_id;
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||
  jsonb_build_object('duplicateBlocked',true,'handoffCompleted',false,'finalizationDispatched',false,
  'duplicateImageId',duplicate_id,'failureCode','DUPLICATE_SOURCE_PREFLIGHT','nextAction','RECLAIM_PRODUCER_SELECT_NEW_SOURCE');
end $fn$;
revoke all on function public.content_pipeline_return_duplicate_visual_candidate_v1(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_return_duplicate_visual_candidate_v1(text,uuid,uuid,text) to service_role;

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

