-- Additive two-execution 3-A. Existing public status and transport leases remain authoritative.
begin;
alter table public."21_content_pipeline_image" add column visual_phase text;
alter table public."21_content_pipeline_image" add column review_candidate jsonb;
alter table public."21_content_pipeline_image" add constraint image_visual_phase_check check (visual_phase is null or visual_phase in ('PRODUCTION_PENDING','PRODUCING','QA_PENDING','REVIEWING','APPROVED'));

-- Includes preflight, but never grants approval or exposes a private URL.
create or replace function public.content_pipeline_review_candidate_v1(p_image_id bigint,p_job_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('jobId',j.job_id,'contractHash',j.contract_hash,'sha256',j.result->>'sha256',
 'sourceSha256',j.result->>'preStagingSourceSha256','bucket',j.result->>'bucket','path',j.result->>'path',
 'preflightOnly',coalesce(j.result->>'preflightOnly',j.spec->>'preflightOnly','false')='true','qaStatus','NOT_EVALUATED')
from public."27_content_pipeline_source_stage_job" j
join public."21_content_pipeline_image" i on i.pipeline_image_id=j.pipeline_image_id
join storage.objects o on o.bucket_id=j.result->>'bucket' and o.name=j.result->>'path'
where i.pipeline_image_id=p_image_id and j.job_id=p_job_id and j.status='STAGED' and j.approved_at is null
 and j.contract_hash=i.generation_contract_hash and j.result->>'bucket'='content-pipeline-staging'
 and j.result->>'sha256' ~ '^[a-f0-9]{64}$'
 and j.result->>'path'=i.pipeline_id::text||'/'||i.pipeline_image_id::text||'/'||(j.result->>'sha256')||'.webp'
 and j.result->>'decode'='PASS' and j.result->>'storageVerification'='PASS'
 and o.metadata->>'mimetype'='image/webp' and (o.metadata->>'size')::bigint=(j.result->>'bytes')::bigint
 and not exists(select 1 from public."27_content_pipeline_source_stage_job" bad
 where bad.pipeline_image_id=j.pipeline_image_id and bad.contract_hash=j.contract_hash
 and bad.result->'semanticValidation'->>'status'='FAIL'
 and (bad.result->>'sha256'=j.result->>'sha256' or (bad.result->'semanticValidation'->>'reason'='SOURCE_MISMATCH'
 and bad.spec->>'sourcePdfPage' is not distinct from j.spec->>'sourcePdfPage'
 and coalesce(bad.result->>'preStagingSourceSha256',bad.result->'provenance'->>'sourceSha256')=coalesce(j.result->>'preStagingSourceSha256',j.result->'provenance'->>'sourceSha256'))))
$$;

CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_producer_v1(p_worker_key text, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype;
 v_token uuid:=extensions.gen_random_uuid(); v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text; v_isolation jsonb; v_native_context jsonb;
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
   and (coalesce((i0.generation_contract->>'contract_version')::int,3)<4 or i0.generation_contract->'production_feasibility'->>'status'='PASS')
   and not (i0.status='RETRY' and coalesce(i0.next_eligible_at,'-infinity'::timestamptz)>now())
   and not (i0.status='PROCESSING' and i0.claim_expires_at>=now())
 order by case
 when public.content_pipeline_visual_recovery_v1(i0.pipeline_image_id) is not null then 0
 when i0.staging_input->>'contractHash'=i0.generation_contract_hash and exists (
 select 1 from public."25_content_pipeline_generated_asset_handoff" h
 where h.handoff_id::text=i0.staging_input->>'handoffId' and h.pipeline_image_id=i0.pipeline_image_id and h.consumed_at is null) then 1
 when i0.status in ('RETRY','PROCESSING') then 2 else 3 end,
 t0.priority,t0.content_topic_id,p0.pipeline_id,i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 v_old_token:=i.claim_token;
 if i.status='PROCESSING' and i.claim_expires_at<now() and v_old_token is not null then
  update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_EXPIRED',error='Image claim TTL expired before Complete/Fail RPC.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reclaimedAt',now()) where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status='RUNNING';
 end if;
 v_contract:=i.generation_contract; v_hash:=i.generation_contract_hash;
 if encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex')<>v_hash then raise exception 'CONTENT_PIPELINE_CONTRACT_HASH_MISMATCH'; end if;
 v_isolation:=jsonb_build_object('mode','FRESH_TASK_ONLY','numLastImagesToInclude',0,'allowPreviousTaskImages',false,'allowPreviousTaskPrompt',false,'referenceImagesScope','CURRENT_PIPELINE_IMAGE_ONLY','isolationKey',i.pipeline_image_id::text||':'||v_hash,'onIsolationMismatch','REGENERATE_WITH_FRESH_CONTEXT_ONCE_THEN_RETRY');
 v_native_context:=jsonb_strip_nulls(jsonb_build_object(
   'pipelineImageId',i.pipeline_image_id,
   'generationContractHash',v_hash,
   'subject',coalesce(v_contract->>'subject',v_contract->>'inspection_target',case when jsonb_typeof(v_contract->'must_show')='array' and jsonb_array_length(v_contract->'must_show')>0 then v_contract->'must_show'->>0 end),
   'sceneDescription',coalesce(v_contract->'scene'->>'description',v_contract->>'visual_objective'),
   'compositionPlan',v_contract->'composition_plan',
   'mustShow',coalesce(v_contract->'must_show','[]'::jsonb),
   'mustNotShow',coalesce(v_contract->'must_not_show','[]'::jsonb),
   'peopleMode',coalesce(v_contract->>'people_mode','NONE'),
   'annotationContract',v_contract->'annotation_contract',
   'mobileRequirement',v_contract->>'mobile_requirement',
   'qaCoreRequired',coalesce(v_contract->'pixel_qa_contract'->'required_visible','[]'::jsonb),
   'semanticObjectiveIsGate',false
  ));
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage='DRAFTED';
 update public."21_content_pipeline_image" set visual_phase='PRODUCING',review_candidate=null,status='PROCESSING',handoff_phase='PRODUCING',upload_request_id=null,upload_dispatched_at=null,claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval '60 minutes',attempt_count=attempt_count+1,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now() where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata) values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimOrder','RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING','claimTtlMinutes',60,'contractSource','STAGE2_IMMUTABLE')) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes' where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_reviewer_v1(p_worker_key text, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype;
 v_token uuid:=extensions.gen_random_uuid(); v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text; v_isolation jsonb; v_native_context jsonb;
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
   and (coalesce((i0.generation_contract->>'contract_version')::int,3)<4 or i0.generation_contract->'production_feasibility'->>'status'='PASS')
   and not (i0.status='RETRY' and coalesce(i0.next_eligible_at,'-infinity'::timestamptz)>now())
   and not (i0.status='PROCESSING' and i0.claim_expires_at>=now())
 order by case
 when public.content_pipeline_visual_recovery_v1(i0.pipeline_image_id) is not null then 0
 when i0.staging_input->>'contractHash'=i0.generation_contract_hash and exists (
 select 1 from public."25_content_pipeline_generated_asset_handoff" h
 where h.handoff_id::text=i0.staging_input->>'handoffId' and h.pipeline_image_id=i0.pipeline_image_id and h.consumed_at is null) then 1
 when i0.status in ('RETRY','PROCESSING') then 2 else 3 end,
 t0.priority,t0.content_topic_id,p0.pipeline_id,i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 v_old_token:=i.claim_token;
 if i.status='PROCESSING' and i.claim_expires_at<now() and v_old_token is not null then
  update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_EXPIRED',error='Image claim TTL expired before Complete/Fail RPC.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reclaimedAt',now()) where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status='RUNNING';
 end if;
 v_contract:=i.generation_contract; v_hash:=i.generation_contract_hash;
 if encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex')<>v_hash then raise exception 'CONTENT_PIPELINE_CONTRACT_HASH_MISMATCH'; end if;
 v_isolation:=jsonb_build_object('mode','FRESH_TASK_ONLY','numLastImagesToInclude',0,'allowPreviousTaskImages',false,'allowPreviousTaskPrompt',false,'referenceImagesScope','CURRENT_PIPELINE_IMAGE_ONLY','isolationKey',i.pipeline_image_id::text||':'||v_hash,'onIsolationMismatch','REGENERATE_WITH_FRESH_CONTEXT_ONCE_THEN_RETRY');
 v_native_context:=jsonb_strip_nulls(jsonb_build_object(
   'pipelineImageId',i.pipeline_image_id,
   'generationContractHash',v_hash,
   'subject',coalesce(v_contract->>'subject',v_contract->>'inspection_target',case when jsonb_typeof(v_contract->'must_show')='array' and jsonb_array_length(v_contract->'must_show')>0 then v_contract->'must_show'->>0 end),
   'sceneDescription',coalesce(v_contract->'scene'->>'description',v_contract->>'visual_objective'),
   'compositionPlan',v_contract->'composition_plan',
   'mustShow',coalesce(v_contract->'must_show','[]'::jsonb),
   'mustNotShow',coalesce(v_contract->'must_not_show','[]'::jsonb),
   'peopleMode',coalesce(v_contract->>'people_mode','NONE'),
   'annotationContract',v_contract->'annotation_contract',
   'mobileRequirement',v_contract->>'mobile_requirement',
   'qaCoreRequired',coalesce(v_contract->'pixel_qa_contract'->'required_visible','[]'::jsonb),
   'semanticObjectiveIsGate',false
  ));
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage='DRAFTED';
 update public."21_content_pipeline_image" set visual_phase='REVIEWING',status='PROCESSING',handoff_phase='PRODUCING',upload_request_id=null,upload_dispatched_at=null,claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval '60 minutes',attempt_count=attempt_count+1,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now() where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata) values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimOrder','RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING','claimTtlMinutes',60,'contractSource','STAGE2_IMMUTABLE')) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes' where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('executionRole','REVIEWER','reviewCandidate',i.review_candidate,'pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_visual_claim_request_status_v1(p_worker_key text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   'executionRole',coalesce(r.response->>'executionRole','LEGACY'),'visualPhase',i.visual_phase,'reviewCandidate',public.content_pipeline_review_candidate_v1(i.pipeline_image_id,(i.review_candidate->>'jobId')::uuid),'status',i.status,'handoffPhase',i.handoff_phase,'claimExpiresAt',i.claim_expires_at,
   'activeClaim',coalesce(active,false),'failureStage',i.failure_stage,'failureCode',i.failure_code,
   'lastError',i.last_error,'updatedAt',i.updated_at,'nextEligibleAt',i.next_eligible_at,
   'recoverableStaging',recovery,'nextAction',case when recovery->>'approved'='true' then 'FOLLOW_TASK_STATUS' when recovery is not null then 'INSPECT_EXISTING_STAGED_JOB' else 'SELECT_SOURCE_OR_NATIVE_FILE' end,
   'claim',case when active then r.response||jsonb_build_object('recoverableStaging',recovery) else r.response-'claimToken' end);
end $function$
;

create or replace function public.content_pipeline_claim_visual_stage_v1(p_worker_key text,p_request_id uuid,p_role text,p_pipeline_image_id bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
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
 values(p_worker_key,p_request_id,p_pipeline_image_id,(c->>'pipelineImageId')::bigint,c);
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object('replayed',false);
end $$;

create or replace function public.content_pipeline_handoff_visual_review_v1(p_worker_key text,p_request_id uuid,p_job_id uuid,p_expected_sha text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public."29_content_pipeline_visual_claim_request"%rowtype;i public."21_content_pipeline_image"%rowtype;c jsonb;candidate jsonb;
begin
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
 if exists(select 1 from public."27_content_pipeline_source_stage_job" where pipeline_image_id=i.pipeline_image_id and status in ('PENDING','RUNNING')) then raise exception 'VISUAL_CANDIDATE_ALREADY_RUNNING';end if;
 update public."23_content_pipeline_image_run" set status='PASS',summary='3-A production stored; QA NOT_EVALUATED',completed_at=now(),
 metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('executionRole','PRODUCER','reviewHandoff',candidate)
 where pipeline_image_run_id=(r.response->>'pipelineImageRunId')::bigint and claim_token=i.claim_token and status='RUNNING';
 if not found then raise exception 'IMAGE_RUN_MISSING';end if;
 update public."21_content_pipeline_image" set status='PENDING',visual_phase='QA_PENDING',review_candidate=candidate,
 handoff_phase=null,claimed_by=null,claim_token=null,claimed_at=null,claim_expires_at=null,next_eligible_at=null,
 retry_action='INSPECT_REVIEW_CANDIDATE',updated_at=now() where pipeline_image_id=i.pipeline_image_id;
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object('handoffCompleted',true,'approvalPerformed',false,'reviewCandidate',candidate);
end $$;

-- Role guards live in SQL as well as MCP. Legacy receipts retain their existing full 3-A protocol.
create or replace function public.content_pipeline_visual_role_guard_v1(p_worker_key text,p_request_id uuid,p_action text,p_spec jsonb default null)
returns void language plpgsql security definer set search_path='' as $$
declare c jsonb;role text;i public."21_content_pipeline_image"%rowtype;j public."27_content_pipeline_source_stage_job"%rowtype;
begin
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 role:=c->'claim'->>'executionRole';
 if role='PRODUCER' and p_action='DISPATCH' and (p_spec->>'preflightOnly' is distinct from 'true' or p_spec ? 'preStagingQa') then raise exception 'PRODUCER_PREFLIGHT_REQUIRED';end if;
 if role='PRODUCER' and p_action in ('QA','APPROVE') then raise exception 'REVIEWER_REQUEST_REQUIRED';end if;
 if role='REVIEWER' and p_action='QA' then
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=(c->'claim'->>'pipelineImageId')::bigint;
 if p_spec->>'jobId' is distinct from i.review_candidate->>'jobId' or public.content_pipeline_review_candidate_v1(i.pipeline_image_id,(i.review_candidate->>'jobId')::uuid) is null then raise exception 'REVIEW_CANDIDATE_INVALID';end if;
 end if;
 if role='REVIEWER' and p_action='DISPATCH' then
  select * into i from public."21_content_pipeline_image" where pipeline_image_id=(c->'claim'->>'pipelineImageId')::bigint;
  select * into j from public."27_content_pipeline_source_stage_job" where job_id=(i.review_candidate->>'jobId')::uuid;
  if public.content_pipeline_review_candidate_v1(i.pipeline_image_id,j.job_id) is null or p_spec->>'preflightOnly'='true' then raise exception 'REVIEW_RESUME_REQUIRED';end if;
  if j.spec ? 'productionMethod' then
   if p_spec ? 'chatFile' or p_spec ? 'generatedAssetUrl' or p_spec ? 'inputFile' or p_spec->>'resumeJobId' is distinct from j.job_id::text
    or p_spec->>'prompt' is distinct from j.spec->>'prompt' or p_spec->'references' is distinct from j.spec->'references'
    or p_spec->>'productionMethod' is distinct from j.spec->>'productionMethod' or p_spec->>'inputAssetUrl' is distinct from j.spec->>'inputAssetUrl'
    then raise exception 'REVIEW_RESUME_REQUIRED';end if;
  elsif (p_spec-'preStagingQa'-'preflightOnly'-'transform') is distinct from (j.spec-'visualMcpOperation'-'preStagingQa'-'preflightOnly'-'transform') then raise exception 'REVIEW_SAME_SOURCE_REQUIRED';end if;
  if j.result->>'preflightOnly'='true' and (j.result->'preStagingQa'->>'status' is distinct from 'PASS' or p_spec->'preStagingQa' is distinct from j.result->'preStagingQa') then raise exception 'PRE_STAGING_VISUAL_QA_REQUIRED';end if;
 end if;
end $$;

CREATE OR REPLACE FUNCTION public.content_pipeline_register_pre_staging_qa_v1(p_worker_key text, p_request_id uuid, p_job_id uuid, p_expected_sha text, p_qa jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; j public."27_content_pipeline_source_stage_job"%rowtype; gate jsonb;
begin
 perform public.content_pipeline_visual_role_guard_v1(p_worker_key,p_request_id,'QA',jsonb_build_object('jobId',p_job_id));
 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 if not found or j.status<>'STAGED' or j.approved_at is not null or j.result->>'sha256' is distinct from p_expected_sha or not coalesce(j.result->>'preflightOnly'='true' or j.spec->>'preflightOnly'='true',false) then raise exception 'PREFLIGHT_CANDIDATE_REQUIRED';end if;
 perform 1 from public."21_content_pipeline_image" where pipeline_image_id=j.pipeline_image_id for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' or j.pipeline_image_id is distinct from (c->'claim'->>'pipelineImageId')::bigint or j.contract_hash is distinct from c->'claim'->>'generationContractHash' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 perform public.content_pipeline_visual_role_guard_v1(p_worker_key,p_request_id,'QA',jsonb_build_object('jobId',p_job_id));
 gate:=public.content_pipeline_pre_staging_gate_v1(j.pipeline_image_id,j.contract_hash,j.spec||jsonb_build_object('preflightOnly',false,'preStagingQa',p_qa),j.result->>'preStagingSourceSha256');
 if gate->>'status' is distinct from 'PASS' then raise exception 'PRE_STAGING_VISUAL_QA_REQUIRED';end if;
 update public."27_content_pipeline_source_stage_job" set result=result||jsonb_build_object('preStagingQa',p_qa,'preStagingQaRegisteredBy',p_worker_key,'preStagingQaRegisteredAt',now()),updated_at=now() where job_id=p_job_id;
 return jsonb_build_object('status','PRE_STAGING_QA_RECORDED','jobId',p_job_id,'activeClaim',true,'approvalPerformed',false,'nextAction','DISPATCH_SAME_SOURCE_WITH_NEW_OPERATION_ID_OR_GENERATION_RESUME_JOB');
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_dispatch_visual_generation_request_v1(p_worker_key text, p_request_id uuid, p_operation_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb;i public."21_content_pipeline_image"%rowtype;j public."27_content_pipeline_source_stage_job"%rowtype;
 t text;r bigint;v_job uuid;ref jsonb;
begin
 perform public.content_pipeline_visual_role_guard_v1(p_worker_key,p_request_id,'DISPATCH',p_spec);
 if p_operation_id is null or jsonb_typeof(p_spec) is distinct from 'object' or length(p_spec::text)>24000
 or coalesce(p_spec->>'productionMethod','') not in ('REFERENCE_BASED_GENERATION','REAL_SOURCE_AI_EDIT')
 or length(coalesce(p_spec->>'prompt','')) not between 20 and 6000
 or jsonb_typeof(p_spec->'transform') is distinct from 'object'
 or jsonb_typeof(p_spec->'references') is distinct from 'array' then raise exception 'INVALID_GENERATION_SPEC';end if;
 if jsonb_array_length(p_spec->'references') not between 1 and 4 then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;
 for ref in select value from jsonb_array_elements(p_spec->'references') loop
   if ref->>'pixelsInspected' is distinct from 'true' or length(coalesce(ref->>'sourceOwner','')) not between 1 and 200
    or coalesce(ref->>'sourcePageUrl','') !~ '^https://' or jsonb_typeof(ref->'verifiedFacts') is distinct from 'array'
    or nullif(ref->>'checkedAt','') is null then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;
   if jsonb_array_length(ref->'verifiedFacts') not between 1 and 10 then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;
 end loop;
 if not (p_spec ? 'chatFile' or p_spec ? 'generatedAssetUrl' or p_spec ? 'resumeJobId') then raise exception 'NATIVE_GENERATED_FILE_REQUIRED';end if;
 if p_spec ? 'chatFile' and (p_spec ? 'generatedAssetUrl' or p_spec ? 'resumeJobId') then raise exception 'MULTIPLE_GENERATED_INPUTS';end if;
 if p_spec ? 'chatFile' and (jsonb_typeof(p_spec->'chatFile') is distinct from 'object' or nullif(p_spec->'chatFile'->>'file_id','') is null or coalesce(p_spec->'chatFile'->>'download_url','') !~ '^https://') then raise exception 'INVALID_CHAT_FILE';end if;
 if p_spec->>'productionMethod'='REAL_SOURCE_AI_EDIT' and not (p_spec ? 'resumeJobId') and not (p_spec ? 'inputFile') then raise exception 'NATIVE_EDIT_INPUT_FILE_REQUIRED';end if;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 perform public.content_pipeline_visual_role_guard_v1(p_worker_key,p_request_id,'DISPATCH',p_spec);
 if c->>'activeClaim' is distinct from 'true' or c->>'handoffPhase' is distinct from 'PRODUCING' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visual-source:'||p_worker_key||':'||p_operation_id::text,0));
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=(c->'claim'->>'pipelineImageId')::bigint for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 perform public.content_pipeline_visual_role_guard_v1(p_worker_key,p_request_id,'DISPATCH',p_spec);
 if c->>'activeClaim' is distinct from 'true' or c->>'handoffPhase' is distinct from 'PRODUCING'
 or i.generation_contract_hash is distinct from c->'claim'->>'generationContractHash' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 if public.content_pipeline_reference_generation_allowed_v1(i.generation_contract,p_spec->>'productionMethod') is distinct from true then raise exception 'REFERENCE_GENERATION_CONTRACT_NOT_ALLOWED';end if;
 select * into j from public."27_content_pipeline_source_stage_job"
 where spec->'visualMcpOperation'->>'workerKey'=p_worker_key and spec->'visualMcpOperation'->>'operationId'=p_operation_id::text
 order by created_at desc limit 1;
 if found then
  if j.pipeline_image_id is distinct from i.pipeline_image_id or j.contract_hash is distinct from i.generation_contract_hash
   or public.content_pipeline_native_file_identity_v1(j.spec-'visualMcpOperation') is distinct from public.content_pipeline_native_file_identity_v1(p_spec) then raise exception 'VISUAL_GENERATION_INPUT_CONFLICT';end if;
  return public.content_pipeline_source_stage_status_v1(j.job_id)||jsonb_build_object('replayed',true,'operationId',p_operation_id);
 end if;
 if exists(select 1 from public."27_content_pipeline_source_stage_job" where pipeline_image_id=i.pipeline_image_id and status in('PENDING','RUNNING')) then raise exception 'VISUAL_CANDIDATE_ALREADY_RUNNING';end if;
 if not exists(select 1 from public."18_content_pipeline" where pipeline_id=i.pipeline_id and ownership_state='CLAIMED' and stage in('DRAFTED','VISUAL')) then raise exception 'INVALID_PIPELINE_STATE';end if;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public."27_content_pipeline_source_stage_job"(pipeline_image_id,claim_token,contract_hash,spec,token_hash)
 values(i.pipeline_image_id,i.claim_token,i.generation_contract_hash,p_spec||jsonb_build_object('visualMcpOperation',jsonb_build_object('workerKey',p_worker_key,'requestId',p_request_id,'operationId',p_operation_id)),extensions.digest(t,'sha256')) returning job_id into v_job;
 select net.http_post(url:='https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-source-stage',
 headers:=jsonb_build_object('content-type','application/json','x-fitbike-source-stage-ticket',t),body:=jsonb_build_object('jobId',v_job),timeout_milliseconds:=60000) into r;
 update public."27_content_pipeline_source_stage_job" set request_id=r where job_id=v_job;
 return jsonb_build_object('jobId',v_job,'requestId',r,'operationId',p_operation_id,'status','DISPATCHED','replayed',false,'productionMethod',p_spec->>'productionMethod');
end $function$
;
-- Service-only, one candidate per operationId; delegates existing URL/file/ticket guards.
create or replace function public.content_pipeline_dispatch_visual_source_request_v1(
 p_worker_key text,p_request_id uuid,p_operation_id uuid,p_spec jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;j public."27_content_pipeline_source_stage_job"%rowtype;d jsonb;meta jsonb;
begin
 perform public.content_pipeline_visual_role_guard_v1(p_worker_key,p_request_id,'DISPATCH',p_spec);
 if p_operation_id is null or jsonb_typeof(p_spec) is distinct from 'object' then raise exception 'INVALID_SOURCE_REQUEST';end if;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 if c->>'handoffPhase' is distinct from 'PRODUCING' then raise exception 'PRODUCING_CLAIM_REQUIRED';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visual-source:'||p_worker_key||':'||p_operation_id::text,0));
 -- Lock the image to serialize dispatch against approval/failure/expiry recovery.
 perform 1 from public."21_content_pipeline_image" where pipeline_image_id=(c->'claim'->>'pipelineImageId')::bigint for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 perform public.content_pipeline_visual_role_guard_v1(p_worker_key,p_request_id,'DISPATCH',p_spec);
 if c->>'activeClaim' is distinct from 'true' or c->>'handoffPhase' is distinct from 'PRODUCING' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 select * into j from public."27_content_pipeline_source_stage_job"
 where spec->'visualMcpOperation'->>'workerKey'=p_worker_key and spec->'visualMcpOperation'->>'operationId'=p_operation_id::text
 order by created_at desc limit 1;
 if found then
  if j.pipeline_image_id is distinct from (c->'claim'->>'pipelineImageId')::bigint or j.contract_hash is distinct from c->'claim'->>'generationContractHash'
   or (j.spec-'visualMcpOperation') is distinct from p_spec then raise exception 'VISUAL_SOURCE_INPUT_CONFLICT';end if;
  return public.content_pipeline_source_stage_status_v1(j.job_id)||jsonb_build_object('replayed',true,'operationId',p_operation_id);
 end if;
 meta:=jsonb_build_object('workerKey',p_worker_key,'requestId',p_request_id,'operationId',p_operation_id);
 d:=public.content_pipeline_dispatch_source_stage_v1(p_spec||jsonb_build_object('visualMcpOperation',meta),
 (c->'claim'->>'pipelineImageId')::bigint,(c->'claim'->>'claimToken')::uuid);
 return d||jsonb_build_object('replayed',false,'operationId',p_operation_id);
end $$;

CREATE OR REPLACE FUNCTION public.content_pipeline_record_staging_v1(p_pipeline_image_id bigint, p_claim_token uuid, p_asset jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public."21_content_pipeline_image"%rowtype; v_path text;
begin
 -- Approved QA lives only in qa; candidate QA remains in the source job receipt.
 p_asset:=p_asset-'imageQa'-'mobileQa'-'imageSeoQa';
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token or i.claim_expires_at<=now() then raise exception 'INVALID_IMAGE_CLAIM'; end if;
 if exists(select 1 from public."29_content_pipeline_visual_claim_request" where pipeline_image_id=i.pipeline_image_id and response->>'claimToken'=p_claim_token::text and response->>'executionRole'='PRODUCER') then raise exception 'REVIEWER_REQUEST_REQUIRED';end if;
 v_path:=i.pipeline_id||'/'||i.pipeline_image_id||'/'||(p_asset->>'sha256')||'.webp';
 if p_asset->>'bucket' is distinct from 'content-pipeline-staging' or p_asset->>'path' is distinct from v_path
 or coalesce(p_asset->>'sha256','') !~ '^[a-f0-9]{64}$' or p_asset->>'mime' is distinct from 'image/webp'
 or coalesce((p_asset->>'bytes')::int,0) not between 12 and 4194304
 or coalesce((p_asset->>'width')::int,0)<1 or coalesce((p_asset->>'height')::int,0)<1
 or p_asset->>'decode' is distinct from 'PASS' or p_asset->>'storageVerification' is distinct from 'PASS'
 or p_asset->>'contractHash' is distinct from i.generation_contract_hash
 or p_asset->'qa'->>'imageQa' is distinct from 'PASS' or p_asset->'qa'->>'mobileQa' is distinct from 'PASS'
 or p_asset->'qa'->>'imageSeoQa' is distinct from 'PASS' then raise exception 'STAGING_PROOF_REQUIRED'; end if;
 if not exists(select 1 from storage.objects where bucket_id='content-pipeline-staging' and name=v_path
 and metadata->>'mimetype'='image/webp' and (metadata->>'size')::int=(p_asset->>'bytes')::int) then raise exception 'STAGING_OBJECT_MISSING'; end if;
 update public."23_content_pipeline_image_run" set status='PASS',summary='3-A READY_FOR_UPLOAD',completed_at=now(),
 metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('stage','3-A','stagingAsset',p_asset)
 where pipeline_image_id=i.pipeline_image_id and claim_token=p_claim_token and status='RUNNING';
 update public."21_content_pipeline_image" set visual_phase='APPROVED',review_candidate=null,staging_asset=p_asset,staging_input=null,status='READY_FOR_UPLOAD',handoff_phase='READY_FOR_UPLOAD',
 generation_status='PASS',qa_status='PASS',file_status='PASS',upload_status='PENDING',claimed_by=null,claim_token=null,
 claimed_at=null,claim_expires_at=null,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now()
 where pipeline_image_id=i.pipeline_image_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'status','READY_FOR_UPLOAD','stagingAsset',p_asset);
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_reject_visual_source_v1(p_worker_key text, p_request_id uuid, p_job_id uuid, p_expected_sha text, p_reason text, p_evidence text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; j public."27_content_pipeline_source_stage_job"%rowtype;
begin
 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 if not found or j.status<>'STAGED' or j.approved_at is not null or j.result->>'sha256' is distinct from p_expected_sha then raise exception 'SOURCE_STAGE_CANDIDATE_INVALID';end if;
 perform 1 from public."21_content_pipeline_image" where pipeline_image_id=j.pipeline_image_id for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 if j.pipeline_image_id is distinct from (c->'claim'->>'pipelineImageId')::bigint or j.contract_hash is distinct from c->'claim'->>'generationContractHash' then raise exception 'SOURCE_JOB_ACCESS_DENIED';end if;
 if p_reason is null or p_evidence is null or p_reason not in ('MUST_SHOW_MISMATCH','MUST_NOT_SHOW_VIOLATION','ANNOTATION_TARGET_MISMATCH','SOURCE_MISMATCH') or length(btrim(p_evidence))<10 or length(p_evidence)>2000 then raise exception 'SEMANTIC_REJECTION_EVIDENCE_REQUIRED';end if;
 update public."27_content_pipeline_source_stage_job" set result=result||jsonb_build_object('semanticValidation',jsonb_build_object('status','FAIL','reason',p_reason,'evidence',p_evidence,'validatedBy',p_worker_key,'requestId',p_request_id,'validatedAt',now(),'sha256',p_expected_sha,'contractHash',j.contract_hash)),updated_at=now() where job_id=p_job_id;
 if c->'claim'->>'executionRole'='REVIEWER' then
 update public."21_content_pipeline_image" set review_candidate=null,visual_phase='PRODUCTION_PENDING' where pipeline_image_id=j.pipeline_image_id;
 return jsonb_build_object('jobId',p_job_id,'semanticInvalid',true,'activeClaim',true,'nextAction','FAIL_OWN_REVIEW_CLAIM_RETRY_PRODUCTION');end if;
 return jsonb_build_object('jobId',p_job_id,'sha256',p_expected_sha,'semanticInvalid',true,'activeClaim',true,'resumeFrom','SOURCE_SELECTION','nextAction','SELECT_NEW_SOURCE_SAME_CLAIM');
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_fail_visual_request_v1(p_worker_key text, p_request_id uuid, p_status text, p_stage text, p_code text, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 update public."21_content_pipeline_image" set visual_phase=case when public.content_pipeline_review_candidate_v1(v_image_id,(review_candidate->>'jobId')::uuid) is not null then 'QA_PENDING' else 'PRODUCTION_PENDING' end where pipeline_image_id=v_image_id;
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
end $function$
;
revoke all on function public.content_pipeline_review_candidate_v1(bigint,uuid) from public,anon,authenticated;
grant execute on function public.content_pipeline_review_candidate_v1(bigint,uuid) to service_role;
revoke all on function public.content_pipeline_claim_visual_stage_v1(text,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_claim_visual_stage_v1(text,uuid,text,bigint) to service_role;
revoke all on function public.content_pipeline_claim_visual_reviewer_v1(text,bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_claim_visual_reviewer_v1(text,bigint) to service_role;
revoke all on function public.content_pipeline_handoff_visual_review_v1(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_handoff_visual_review_v1(text,uuid,uuid,text) to service_role;
revoke all on function public.content_pipeline_visual_role_guard_v1(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_visual_role_guard_v1(text,uuid,text,jsonb) to service_role;
CREATE OR REPLACE FUNCTION public.content_pipeline_approve_source_stage_v1(p_job_id uuid, p_claim_token uuid, p_expected_sha text, p_qa jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public."27_content_pipeline_source_stage_job"%rowtype;i public."21_content_pipeline_image"%rowtype;a jsonb;role text;
begin
 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 if not found or j.status<>'STAGED' or j.pipeline_image_id is null or j.approved_at is not null or j.result->>'sha256' is distinct from p_expected_sha then raise exception 'SOURCE_STAGE_CANDIDATE_INVALID';end if;
 if j.result->'semanticValidation'->>'status'='FAIL' or j.spec->>'preflightOnly'='true' or j.result->>'preflightOnly'='true' or exists (
 select 1 from public."27_content_pipeline_source_stage_job" bad where bad.pipeline_image_id=j.pipeline_image_id and bad.contract_hash=j.contract_hash and bad.result->'semanticValidation'->>'status'='FAIL'
 and (bad.result->>'sha256'=p_expected_sha or (bad.result->'semanticValidation'->>'reason'='SOURCE_MISMATCH'
 and coalesce(bad.result->>'preStagingSourceSha256',bad.result->'provenance'->>'sourceSha256')=coalesce(j.result->>'preStagingSourceSha256',j.result->'provenance'->>'sourceSha256'))))
 then raise exception 'SEMANTICALLY_INVALID_OR_PREFLIGHT_ASSET';end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=j.pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.handoff_phase is distinct from 'PRODUCING' or i.staging_asset is not null or i.claim_token is distinct from p_claim_token or i.claim_expires_at<=now() then raise exception 'INVALID_PRODUCER_CLAIM';end if;
 if exists(select 1 from public."29_content_pipeline_visual_claim_request" where pipeline_image_id=i.pipeline_image_id and response->>'claimToken'=p_claim_token::text and response->>'executionRole'='PRODUCER') then raise exception 'REVIEWER_REQUEST_REQUIRED';end if;
 if exists(select 1 from public."29_content_pipeline_visual_claim_request" where pipeline_image_id=i.pipeline_image_id and response->>'claimToken'=p_claim_token::text and response->>'executionRole'='REVIEWER') then
  if public.content_pipeline_review_candidate_v1(i.pipeline_image_id,(i.review_candidate->>'jobId')::uuid) is null
   or (j.job_id::text=i.review_candidate->>'jobId' or (j.spec->'visualMcpOperation'->>'workerKey'=i.claimed_by and j.spec->'preStagingQa'->>'sourceJobId'=i.review_candidate->>'jobId'
    and j.spec->'preStagingQa'->>'sourceSha256'=i.review_candidate->>'sourceSha256')) is distinct from true then raise exception 'REVIEW_CANDIDATE_INVALID';end if;
 end if;
 if not exists(select 1 from public."23_content_pipeline_image_run" where pipeline_image_id=i.pipeline_image_id and claim_token=p_claim_token and status='RUNNING') then raise exception 'IMAGE_RUN_MISSING';end if;
 if i.generation_contract_hash is distinct from j.contract_hash or p_qa->>'contractHash' is distinct from j.contract_hash then raise exception 'CONTRACT_CHANGED';end if;
 role:=upper(coalesce(i.generation_contract->>'asset_role','BODY'));
 if role in('THUMBNAIL','HERO','THUMBNAIL_HERO') and p_qa->>'representativeImageQa' is distinct from 'PASS' then raise exception 'REPRESENTATIVE_QA_REQUIRED';end if;
 if role in('THUMBNAIL','THUMBNAIL_HERO') and p_qa->>'cardCropQa' is distinct from 'PASS' then raise exception 'CARD_CROP_QA_REQUIRED';end if;
 if role in('HERO','THUMBNAIL_HERO') and p_qa->>'heroCropQa' is distinct from 'PASS' then raise exception 'HERO_CROP_QA_REQUIRED';end if;
 a:=j.result||jsonb_build_object('contractHash',j.contract_hash,'qa',p_qa||jsonb_build_object('sourceAssetUrl',coalesce(j.spec->>'sourceAssetUrl',j.spec->>'inputAssetUrl',j.result->'provenance'->>'sourceAssetUrl'),'provenance',j.result->'provenance'),'sourceJobId',j.job_id);
 a:=public.content_pipeline_record_staging_v1(j.pipeline_image_id,p_claim_token,a);
 update public."27_content_pipeline_source_stage_job" set approved_at=now(),updated_at=now() where job_id=j.job_id;
 delete from public."28_content_pipeline_source_stage_inspection_chunk" where job_id=j.job_id;
 return a;
end $function$
;
commit;
