create or replace function public.content_pipeline_claim_visual_reviewer_v1(p_worker_key text, p_pipeline_image_id bigint default null::bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
        or coalesce((i0.generation_contract->>'contract_version')::int,3)>=5)
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
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract,'runtimePolicy',v_policy,'reviewRequirements',v_review,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimOrder','RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING','claimTtlMinutes',60,'contractSource',case when v_version>=5 then 'STAGE2_V5_SEMANTIC' else 'STAGE2_V4_IMMUTABLE' end)) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes' where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('executionRole','REVIEWER','reviewCandidate',i.review_candidate,'pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'runtimePolicy',v_policy,'reviewRequirements',v_review,'nativeGenerationIsolationPolicy',v_isolation,'nativeGenerationContext',v_native_context,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end
$function$;
