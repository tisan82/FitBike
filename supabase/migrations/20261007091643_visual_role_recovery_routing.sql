begin;
-- Discovery only: does not approve, hand off or mutate a lease.
create or replace function public.content_pipeline_owned_visual_candidate_v1(p_worker_key text,p_image_id bigint)
returns jsonb language sql stable security definer set search_path='' as $$
 select candidate || jsonb_build_object('createdAt',j.created_at,'resumeFrom','PRODUCTION_HANDOFF','qaStatus','NOT_EVALUATED')
 from public."27_content_pipeline_source_stage_job" j
 cross join lateral (select public.content_pipeline_review_candidate_v1(p_image_id,j.job_id) candidate) proof
 where j.pipeline_image_id=p_image_id
 and j.spec->'visualMcpOperation'->>'workerKey'=p_worker_key
 and (j.result->>'preflightOnly'='true' or j.spec->>'preflightOnly'='true')
 and candidate is not null
 order by j.created_at desc,j.job_id desc limit 1
$$;
revoke all on function public.content_pipeline_owned_visual_candidate_v1(text,bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_owned_visual_candidate_v1(text,bigint) to service_role;

CREATE OR REPLACE FUNCTION public.content_pipeline_owned_visual_recovery_v1(p_worker_key text, p_image_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('jobId',j.job_id,'sha256',j.result->>'sha256',
   'canonicalPath',j.result->>'path','bucket',j.result->>'bucket','contractHash',j.contract_hash,
   'bytes',j.result->'bytes','width',j.result->'width','height',j.result->'height',
   'approved',j.approved_at is not null,'createdAt',j.created_at,
   'resumeFrom','INSPECTION','storagePresent',true)
 from public."27_content_pipeline_source_stage_job" j
 join public."21_content_pipeline_image" i on i.pipeline_image_id=j.pipeline_image_id
 join storage.objects o on o.bucket_id='content-pipeline-staging' and o.name=j.result->>'path'
 where i.pipeline_image_id=p_image_id and j.status='STAGED'
 and j.spec->'visualMcpOperation'->>'workerKey'=p_worker_key
 and j.result->>'decode'='PASS' and j.result->>'storageVerification'='PASS'
 and o.metadata->>'mimetype'='image/webp' and (o.metadata->>'size')::bigint=(j.result->>'bytes')::bigint
 and (i.review_candidate is null or (
 public.content_pipeline_review_candidate_v1(i.pipeline_image_id,(i.review_candidate->>'jobId')::uuid) is not null
 and (j.job_id::text=i.review_candidate->>'jobId' or (
 j.spec->'preStagingQa'->>'sourceJobId'=i.review_candidate->>'jobId'
 and j.spec->'preStagingQa'->>'sourceSha256'=i.review_candidate->>'sourceSha256'))))
   and j.contract_hash=i.generation_contract_hash
 and coalesce(j.spec->>'preflightOnly','false')<>'true' and coalesce(j.result->>'preflightOnly','false')<>'true'
 and not exists(select 1 from public."27_content_pipeline_source_stage_job" bad
 where bad.pipeline_image_id=j.pipeline_image_id and bad.contract_hash=j.contract_hash and bad.result->'semanticValidation'->>'status'='FAIL'
 and (bad.result->>'sha256'=j.result->>'sha256' or (bad.result->'semanticValidation'->>'reason'='SOURCE_MISMATCH'
 and bad.spec->>'sourcePdfPage' is not distinct from j.spec->>'sourcePdfPage'
 and coalesce(bad.result->>'preStagingSourceSha256',bad.result->'provenance'->>'sourceSha256')=coalesce(j.result->>'preStagingSourceSha256',j.result->'provenance'->>'sourceSha256'))))
   and (j.approved_at is null or i.staging_asset->>'sourceJobId'=j.job_id::text)
   and j.result->>'bucket'='content-pipeline-staging'
   and j.result->>'sha256' ~ '^[a-f0-9]{64}$'
   and j.result->>'path'=i.pipeline_id::text||'/'||i.pipeline_image_id::text||'/'||(j.result->>'sha256')||'.webp'
 order by (j.approved_at is not null) desc,j.created_at desc,j.job_id limit 1
$function$
;
revoke all on function public.content_pipeline_owned_visual_recovery_v1(text,bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_owned_visual_recovery_v1(text,bigint) to service_role;

CREATE OR REPLACE FUNCTION public.content_pipeline_visual_claim_request_status_v1(p_worker_key text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public."29_content_pipeline_visual_claim_request"%rowtype;
 i public."21_content_pipeline_image"%rowtype; active boolean; owns boolean; recovery jsonb; production_recovery jsonb; role text; candidate jsonb;
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
 candidate:=public.content_pipeline_review_candidate_v1(i.pipeline_image_id,(i.review_candidate->>'jobId')::uuid);
 production_recovery:=public.content_pipeline_owned_visual_candidate_v1(p_worker_key,i.pipeline_image_id);
 recovery:=public.content_pipeline_owned_visual_recovery_v1(p_worker_key,i.pipeline_image_id);
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
   'recoverableStaging',recovery,'resumeFrom',case when role='PRODUCER' and production_recovery is not null then 'PRODUCTION_HANDOFF' when role='REVIEWER' and recovery is not null then 'STAGED_INSPECTION' when role='REVIEWER' and candidate is not null then 'REVIEW_CANDIDATE_INSPECTION' when role='REVIEWER' then null else 'SOURCE_SELECTION' end,'nextAction',case when not coalesce(active,false) then case when i.status in ('PENDING','RETRY','PROCESSING') and ((role='PRODUCER' and i.visual_phase in ('PRODUCTION_PENDING','PRODUCING')) or (role='REVIEWER' and candidate is not null) or role='LEGACY') then 'RECLAIM_OWN_ROLE_BEFORE_WRITE' else 'FOLLOW_TASK_STATUS' end when role='PRODUCER' and production_recovery is not null then 'HANDOFF_EXISTING_PRODUCTION_CANDIDATE' when role='REVIEWER' and recovery is not null then 'INSPECT_EXISTING_STAGED_JOB' when role='REVIEWER' and candidate is not null then 'INSPECT_REVIEW_CANDIDATE' when role='REVIEWER' then 'FOLLOW_TASK_STATUS' when recovery->>'approved'='true' then 'FOLLOW_TASK_STATUS' when recovery is not null then 'INSPECT_EXISTING_STAGED_JOB' else 'SELECT_SOURCE_OR_NATIVE_FILE' end,
   'claim',case when active then r.response||jsonb_build_object('recoverableStaging',recovery,'recoverableProductionCandidate',production_recovery,'reviewCandidate',candidate) else r.response-'claimToken' end);
end $function$
;
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
 when public.content_pipeline_owned_visual_candidate_v1(p_worker_key,i0.pipeline_image_id) is not null then 0
 when public.content_pipeline_owned_visual_recovery_v1(p_worker_key,i0.pipeline_image_id) is not null then 1
 when i0.staging_input->>'contractHash'=i0.generation_contract_hash and exists (
 select 1 from public."25_content_pipeline_generated_asset_handoff" h
 where h.handoff_id::text=i0.staging_input->>'handoffId' and h.pipeline_image_id=i0.pipeline_image_id and h.consumed_at is null) then 2
 when i0.status in ('RETRY','PROCESSING') then 3 else 4 end,
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
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata) values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimOrder','OWNED_PREFLIGHT_RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING','claimTtlMinutes',60,'contractSource','STAGE2_IMMUTABLE')) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes' where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_fail_visual_request_v1(p_worker_key text, p_request_id uuid, p_status text, p_stage text, p_code text, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; v_image_id bigint; recovery jsonb; production_recovery jsonb; candidate jsonb; role text;
begin
 select pipeline_image_id into v_image_id from public."29_content_pipeline_visual_claim_request"
 where worker_key=p_worker_key and request_id=p_request_id;
 perform 1 from public."21_content_pipeline_image" where pipeline_image_id=v_image_id for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 if p_status not in ('RETRY','HOLD') then raise exception 'INVALID_FAILURE_STATUS';end if;
 recovery:=c->'recoverableStaging';
 production_recovery:=public.content_pipeline_owned_visual_candidate_v1(p_worker_key,v_image_id);
 candidate:=public.content_pipeline_review_candidate_v1(v_image_id,(c->'reviewCandidate'->>'jobId')::uuid);
 role:=c->>'executionRole';
 perform public.content_pipeline_fail_image_v1(
   p_pipeline_image_id=>v_image_id,p_pipeline_image_run_id=>(c->'claim'->>'pipelineImageRunId')::bigint,
   p_claim_token=>(c->'claim'->>'claimToken')::uuid,p_failure_status=>p_status,
   p_failure_stage=>p_stage,p_failure_code=>p_code,p_error=>p_error,
   p_retry_action=>case when role='PRODUCER' and production_recovery is not null then 'HANDOFF_EXISTING_PRODUCTION_CANDIDATE' when role='REVIEWER' and candidate is not null then case when recovery is not null and recovery<>'null'::jsonb then 'RESUME_STAGED_INSPECTION' else 'INSPECT_REVIEW_CANDIDATE' end when recovery is not null and recovery<>'null'::jsonb then 'RESUME_STAGED_INSPECTION' else 'RESUME_LAST_SUCCESSFUL_STAGE' end,
   p_metadata=>jsonb_build_object('transport','VISUAL_MCP','requestId',p_request_id,'recoverableStaging',recovery,'recoverableProductionCandidate',production_recovery,'reviewCandidate',candidate,'executionRole',role));
 update public."21_content_pipeline_image" set visual_phase=case when public.content_pipeline_review_candidate_v1(v_image_id,(review_candidate->>'jobId')::uuid) is not null then 'QA_PENDING' else 'PRODUCTION_PENDING' end where pipeline_image_id=v_image_id;
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
end $function$
;
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
 and bad.spec->>'sourcePdfPage' is not distinct from j.spec->>'sourcePdfPage'
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
