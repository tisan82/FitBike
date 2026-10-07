begin;
-- Discovery attests an already preserved INPUT, never a STAGED candidate or pixel QA.
create or replace function public.content_pipeline_owned_native_input_v1(p_worker_key text,p_image_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j record; a jsonb; s jsonb; ref jsonb; refs_ok boolean;
begin
 if nullif(trim(p_worker_key),'') is null then return null;end if;
 for j in select j0.*,i.pipeline_id,i.generation_contract from public."27_content_pipeline_source_stage_job" j0
 join public."21_content_pipeline_image" i on i.pipeline_image_id=j0.pipeline_image_id
 where j0.pipeline_image_id=p_image_id and j0.contract_hash=i.generation_contract_hash
 and j0.status='FAILED' and j0.spec->'visualMcpOperation'->>'workerKey'=p_worker_key
 and j0.result->>'checkpoint' in ('GENERATED_BINARY_PRESERVED','STORAGE_VERIFIED')
 and coalesce(j0.result->'semanticValidation'->>'status','')<>'FAIL'
 order by j0.created_at desc,j0.job_id desc loop
 a:=j.result->'generatedInput';s:=j.spec;
 if jsonb_typeof(a) is distinct from 'object' or a->>'bucket' is distinct from 'content-pipeline-staging'
 or a->>'mime' is distinct from 'image/webp' or a->>'decode' is distinct from 'PASS' or a->>'signature' is distinct from 'RIFF/WEBP'
 or coalesce(a->>'sha256','') !~ '^[a-f0-9]{64}$'
 or a->>'path' is distinct from j.pipeline_id::text||'/'||p_image_id::text||'/'||(a->>'sha256')||'.webp'
 or coalesce(a->>'bytes','') !~ '^[1-9][0-9]{0,8}$'
 or coalesce(a->>'width','') !~ '^[1-9][0-9]{0,4}$' or coalesce(a->>'height','') !~ '^[1-9][0-9]{0,4}$'
 then continue;end if;
 if jsonb_typeof(a->'bytes') is distinct from 'number' or jsonb_typeof(a->'width') is distinct from 'number' or jsonb_typeof(a->'height') is distinct from 'number'
 or (a->>'bytes')::bigint>4194304 or (a->>'width')::bigint*(a->>'height')::bigint>8000000 then continue;end if;
 if not exists(select 1 from storage.objects o where o.bucket_id=a->>'bucket' and o.name=a->>'path'
 and o.metadata->>'mimetype'='image/webp' and o.metadata->>'size'=a->>'bytes') then continue;end if;
 if public.content_pipeline_reference_generation_allowed_v1(j.generation_contract,s->>'productionMethod') is distinct from true
 or length(coalesce(s->>'prompt','')) not between 20 and 6000
 or jsonb_typeof(s->'transform') is distinct from 'object' or jsonb_typeof(s->'references') is distinct from 'array'
 then continue;end if;
 if s->>'productionMethod'='NATIVE_FULL_GENERATION' then
 if jsonb_array_length(s->'references')<>0 or s ? 'inputAssetUrl' then continue;end if;
 elsif jsonb_array_length(s->'references') not between 1 and 4 then continue;end if;
 refs_ok:=true;
 for ref in select value from jsonb_array_elements(s->'references') loop
 if ref->>'pixelsInspected' is distinct from 'true' or coalesce(ref->>'sourcePageUrl','') !~ '^https://'
 or length(coalesce(ref->>'sourceOwner','')) not between 1 and 200
 or jsonb_typeof(ref->'verifiedFacts') is distinct from 'array' or nullif(ref->>'checkedAt','') is null
 then refs_ok:=false;exit;end if;
 if jsonb_array_length(ref->'verifiedFacts') not between 1 and 10 then refs_ok:=false;exit;end if;
 end loop;
 if not refs_ok then continue;end if;
 if s->>'productionMethod'='REAL_SOURCE_AI_EDIT' and (coalesce(s->>'inputAssetUrl','') !~ '^https://' or not exists(
 select 1 from jsonb_array_elements(s->'references') r where r->>'sourceAssetUrl'=s->>'inputAssetUrl')) then continue;end if;
 -- Rejections from ANY worker for this immutable Task/Contract poison the same input identity.
 if exists(select 1 from public."27_content_pipeline_source_stage_job" bad where bad.pipeline_image_id=p_image_id
 and bad.contract_hash=j.contract_hash and bad.result->'semanticValidation'->>'status'='FAIL'
 and (bad.result->'generatedInput'->>'sha256'=a->>'sha256' or bad.result->>'sha256'=a->>'sha256'
 or coalesce(bad.result->>'preStagingSourceSha256',bad.result->'provenance'->>'sourceSha256')=a->>'sha256'
 or (j.result->'generation'->>'inputSha256' is not null and bad.result->'generation'->>'inputSha256'=j.result->'generation'->>'inputSha256')))
 then continue;end if;
 return jsonb_build_object('sourceJobId',j.job_id,'inputSha256',a->>'sha256','sourceSha256',a->>'sha256','canonicalSha256',null,
 'contractHash',j.contract_hash,'status','INPUT_PRESERVED','sourceJobStatus',j.status,'checkpoint',j.result->>'checkpoint',
 'bucket',a->>'bucket','path',a->>'path','bytes',a->'bytes','width',a->'width','height',a->'height',
 'storagePresent',true,'qaStatus','NOT_EVALUATED','resumeFrom','SOURCE_STAGE','createdAt',j.created_at,
 'spec',jsonb_strip_nulls(jsonb_build_object('productionMethod',s->>'productionMethod','prompt',s->>'prompt',
 'references',s->'references','inputAssetUrl',s->>'inputAssetUrl','transform',s->'transform','resumeJobId',j.job_id,
 'nativeAttemptId',s->>'nativeAttemptId','preflightOnly',true)));
 end loop;
 return null;
end $$;
revoke all on function public.content_pipeline_owned_native_input_v1(text,bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_owned_native_input_v1(text,bigint) to service_role;

do $guard$ begin if md5(pg_get_functiondef('public.content_pipeline_visual_claim_request_status_v1(text,uuid)'::regprocedure))<>'058b9f5580aef7a332256ef7ee6ee054' then raise exception 'NATIVE_RECOVERY_FUNCTION_DRIFT: content_pipeline_visual_claim_request_status_v1';end if;end $guard$;
CREATE OR REPLACE FUNCTION public.content_pipeline_visual_claim_request_status_v1(p_worker_key text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public."29_content_pipeline_visual_claim_request"%rowtype;
 i public."21_content_pipeline_image"%rowtype; active boolean; owns boolean; recovery jsonb; production_recovery jsonb; role text; candidate jsonb; native_input jsonb;
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
end $function$

;

do $guard$ begin if md5(pg_get_functiondef('public.content_pipeline_claim_visual_producer_v1(text,bigint)'::regprocedure))<>'716da290f4ab50de58198d08483fa259' then raise exception 'NATIVE_RECOVERY_FUNCTION_DRIFT: content_pipeline_claim_visual_producer_v1';end if;end $guard$;
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
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract,'runtimePolicy',v_policy,'reviewRequirements',v_review,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimOrder','OWNED_PREFLIGHT_RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING','claimTtlMinutes',60,'contractSource',case when v_version>=5 then 'STAGE2_V5_SEMANTIC' else 'STAGE2_V4_IMMUTABLE' end)) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes' where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'runtimePolicy',v_policy,'reviewRequirements',v_review,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end
$function$

;

do $guard$ begin if md5(pg_get_functiondef('public.content_pipeline_fail_visual_request_v1(text,uuid,text,text,text,text)'::regprocedure))<>'b53dd6e323d586302c906cfe27aa402f' then raise exception 'NATIVE_RECOVERY_FUNCTION_DRIFT: content_pipeline_fail_visual_request_v1';end if;end $guard$;
CREATE OR REPLACE FUNCTION public.content_pipeline_fail_visual_request_v1(p_worker_key text, p_request_id uuid, p_status text, p_stage text, p_code text, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; v_image_id bigint; recovery jsonb; production_recovery jsonb; candidate jsonb; role text; native_input jsonb;
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
 native_input:=nullif(c->'recoverableNativeInput','null'::jsonb);
 perform public.content_pipeline_fail_image_v1(
   p_pipeline_image_id=>v_image_id,p_pipeline_image_run_id=>(c->'claim'->>'pipelineImageRunId')::bigint,
   p_claim_token=>(c->'claim'->>'claimToken')::uuid,p_failure_status=>p_status,
   p_failure_stage=>p_stage,p_failure_code=>p_code,p_error=>p_error,
   p_retry_action=>case when role='PRODUCER' and production_recovery is not null then 'HANDOFF_EXISTING_PRODUCTION_CANDIDATE' when role='REVIEWER' and candidate is not null then case when recovery is not null and recovery<>'null'::jsonb then 'RESUME_STAGED_INSPECTION' else 'INSPECT_REVIEW_CANDIDATE' end when recovery is not null and recovery<>'null'::jsonb then 'RESUME_STAGED_INSPECTION' when native_input is not null then 'RESUME_PRESERVED_NATIVE_INPUT' else 'RESUME_LAST_SUCCESSFUL_STAGE' end,
   p_metadata=>jsonb_build_object('transport','VISUAL_MCP','requestId',p_request_id,'recoverableStaging',recovery,'recoverableProductionCandidate',production_recovery,'reviewCandidate',candidate,'recoverableNativeInput',native_input,'executionRole',role));
 update public."21_content_pipeline_image" set visual_phase=case when public.content_pipeline_review_candidate_v1(v_image_id,(review_candidate->>'jobId')::uuid) is not null then 'QA_PENDING' else 'PRODUCTION_PENDING' end where pipeline_image_id=v_image_id;
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
end $function$

;

do $guard$ begin if md5(pg_get_functiondef('public.content_pipeline_native_attempt_audit_v1(text,bigint,uuid)'::regprocedure))<>'53b9b8dfcdeacad6bb0c2548b4571627' then raise exception 'NATIVE_RECOVERY_FUNCTION_DRIFT: content_pipeline_native_attempt_audit_v1';end if;end $guard$;
CREATE OR REPLACE FUNCTION public.content_pipeline_native_attempt_audit_v1(p_worker_key text, p_image_id bigint, p_request_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select jsonb_build_object('provenance','OPERATOR_REPORTED','serverObservedNativeCall',false,
 'coverage',case when count(*)=0 then 'MISSING' else 'RECORDED_EVENTS' end,
 'events',coalesce(jsonb_agg(event order by recorded_at),'[]'::jsonb)) from (
 select e.recorded_at,jsonb_build_object('requestId',e.request_id,'attemptId',e.attempt_id,'attemptNumber',e.attempt_number,'phase',e.phase,'pipelineImageId',e.pipeline_image_id,'contractHash',e.contract_hash,'recordedAt',e.recorded_at,'evidence',e.evidence,'requestMatchesActualCall',case when e.phase='RESULT' then e.evidence->'actualNativeCall'=(select q.evidence->'nativeCall' from public."30_content_pipeline_native_attempt_event" q where q.worker_key=e.worker_key and q.request_id=e.request_id and q.attempt_id=e.attempt_id and q.phase='REQUEST') else null end,
 'captureValidation',case when e.phase in ('REQUEST','RESULT') then public.content_pipeline_validate_native_call_v2(case when e.phase='REQUEST' then e.evidence->'nativeCall' else e.evidence->'actualNativeCall' end) else null end,
 'serverReceivedJobs',coalesce((select jsonb_agg(jsonb_build_object('jobId',j.job_id,'status',j.status,'receivedPrompt',j.spec->>'prompt','receivedFileId',coalesce(j.spec->'chatFile'->>'file_id',j.spec->'nativeAttemptBinding'->'inspectedOutput'->>'fileId'),'nativeInputSha',j.result->'generation'->>'inputSha256','canonicalSha',j.result->>'sha256','preStagingSourceSha',j.result->>'preStagingSourceSha256','jobAccepted',true,'binaryReceipt',case when j.result->'generation'->>'inputSha256' ~ '^[a-f0-9]{64}$' or (j.result->'generatedInput'->>'decode'='PASS' and j.result->'generatedInput'->>'sha256' ~ '^[a-f0-9]{64}$') then 'CONFIRMED' else 'UNKNOWN' end,'normalizedInputSha',j.result->'generatedInput'->>'sha256','checkpoint',j.result->>'checkpoint','nativeAttemptBinding',j.spec->'nativeAttemptBinding')) from public."27_content_pipeline_source_stage_job" j where j.pipeline_image_id=e.pipeline_image_id and j.contract_hash=e.contract_hash and j.spec->'visualMcpOperation'->>'requestId'=e.request_id::text and j.spec->'visualMcpOperation'->>'workerKey'=p_worker_key and j.spec->'visualMcpOperation'->>'operationId'=e.evidence->>'operationId'),'[]'::jsonb)) event
 from public."30_content_pipeline_native_attempt_event" e where e.worker_key=p_worker_key and e.pipeline_image_id=p_image_id and (p_request_id is null or e.request_id=p_request_id) order by e.recorded_at desc limit 30
) entries;
$function$

;

commit;
