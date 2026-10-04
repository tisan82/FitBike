CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_producer_v1(p_worker_key text, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype;
 v_token uuid:=extensions.gen_random_uuid(); v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_WORKER_KEY'; end if;
 for p in select p0.* from public."18_content_pipeline" p0 join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL') order by t0.priority,t0.content_topic_id,p0.pipeline_id loop
   begin perform public.content_pipeline_sync_images_v1(p.pipeline_id); exception when others then continue; end;
 end loop;
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id
 where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL')
   and (p_pipeline_image_id is null or i0.pipeline_image_id=p_pipeline_image_id)
   and i0.status in ('PENDING','RETRY','PROCESSING') and i0.staging_asset is null
   and i0.generation_contract is not null and i0.generation_contract_hash is not null
   and (coalesce((i0.generation_contract->>'contract_version')::int,3)<4 or i0.generation_contract->'production_feasibility'->>'status'='PASS')
   and not (i0.status='RETRY' and coalesce(i0.next_eligible_at,'-infinity'::timestamptz)>now())
   and not (i0.status='PROCESSING' and i0.claim_expires_at>=now())
 order by case
 when public.content_pipeline_visual_recovery_v1(i0.pipeline_image_id) is not null then 0
 when i0.staging_input->>'contractHash'=i0.generation_contract_hash and exists (
 select 1 from public."25_content_pipeline_generated_asset_handoff" h
 where h.handoff_id::text=i0.staging_input->>'handoffId' and h.pipeline_image_id=i0.pipeline_image_id
 and h.consumed_at is null) then 1
 when i0.status in ('RETRY','PROCESSING') then 2 else 3 end,
 t0.priority,t0.content_topic_id,p0.pipeline_id,i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 v_old_token:=i.claim_token;
 if i.status='PROCESSING' and i.claim_expires_at<now() and v_old_token is not null then
  update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_EXPIRED',error='Image claim TTL expired before Complete/Fail RPC.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reclaimedAt',now()) where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status='RUNNING';
 end if;
 v_contract:=i.generation_contract; v_hash:=i.generation_contract_hash;
 if encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex')<>v_hash then raise exception 'CONTENT_PIPELINE_CONTRACT_HASH_MISMATCH'; end if;
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage='DRAFTED';
 update public."21_content_pipeline_image" set status='PROCESSING',handoff_phase='PRODUCING',upload_request_id=null,upload_dispatched_at=null,claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval '60 minutes',attempt_count=attempt_count+1,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now() where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata) values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract,'claimOrder','RECOVERABLE_STAGING_HANDOFF_RETRY_PENDING','claimTtlMinutes',60,'contractSource','STAGE2_IMMUTABLE')) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes' where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end $function$

;
CREATE OR REPLACE FUNCTION public.content_pipeline_validate_image_brief_feasibility_v1(p_brief jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  pf jsonb; flex jsonb; reasons jsonb := '[]'::jsonb; must_count int := 0;
  full_allowed boolean := false; ai_edit boolean := true;
begin
  if p_brief is null or jsonb_typeof(p_brief) <> 'object' then
    return jsonb_build_object('status','FAIL','reasons',jsonb_build_array('IMAGE_BRIEF_MISSING'));
  end if;
  pf := p_brief->'production_feasibility';
  flex := p_brief->'production_flexibility';
  if jsonb_typeof(pf) <> 'object' or coalesce(pf->>'status','') <> 'PASS' then reasons := reasons || '"PRODUCTION_FEASIBILITY_NOT_PASS"'::jsonb; end if;
  if coalesce(pf->>'single_source_satisfiable','false') <> 'true' then reasons := reasons || '"SINGLE_SOURCE_NOT_SATISFIABLE"'::jsonb; end if;
  if coalesce(pf->>'multi_source_composition_required','false') = 'true' then reasons := reasons || '"MULTI_SOURCE_COMPOSITION_REQUIRED"'::jsonb; end if;
  if coalesce(pf->>'mobile_single_question','false') <> 'true' then reasons := reasons || '"MOBILE_SINGLE_QUESTION_NOT_CONFIRMED"'::jsonb; end if;
  if jsonb_typeof(flex) <> 'object' then reasons := reasons || '"PRODUCTION_FLEXIBILITY_MISSING"'::jsonb; end if;
  if coalesce(p_brief->>'manual_visual_source_allowed','false') = 'true' then reasons := reasons || '"MANUAL_PDF_VISUAL_NOT_ALLOWED"'::jsonb; end if;
  if jsonb_typeof(p_brief->'must_show')='array' then must_count:=jsonb_array_length(p_brief->'must_show'); end if;
  if must_count > 4 then reasons := reasons || '"MUST_SHOW_TOO_COMPLEX"'::jsonb; end if;
  full_allowed := coalesce(p_brief->>'full_generation_allowed','false')='true';
  if coalesce(pf->>'full_generation_required','false')='true' and not full_allowed then reasons := reasons || '"FULL_GENERATION_CONFLICT"'::jsonb; end if;
  ai_edit := coalesce(p_brief->>'generative_edit_allowed',p_brief->>'ai_edit_allowed','true')='true';
  if jsonb_typeof(p_brief->'source_priority')='array' then
    if not full_allowed and (p_brief->'source_priority') ? 'FULL_AI_GENERATION' then reasons := reasons || '"FULL_AI_PRIORITY_NOT_ALLOWED"'::jsonb; end if;
    if not ai_edit and (p_brief->'source_priority') ? 'REAL_SOURCE_AI_EDIT' then reasons := reasons || '"AI_EDIT_PRIORITY_NOT_ALLOWED"'::jsonb; end if;
  end if;
  if jsonb_typeof(flex)='object' then
    if coalesce(flex->>'exact_source_required','false')='true' and coalesce(p_brief->>'production_source_required','false')<>'true' then reasons := reasons || '"EXACT_SOURCE_WITHOUT_PRODUCTION_SOURCE"'::jsonb; end if;
    if (coalesce(flex->>'exact_text_required','false')='true' or coalesce(flex->>'exact_number_required','false')='true') and coalesce(p_brief->>'production_source_required','false')<>'true' then reasons := reasons || '"EXACT_DATA_REQUIRES_PRODUCTION_SOURCE"'::jsonb; end if;
  end if;
  if jsonb_typeof(p_brief->'must_show')='array' and jsonb_typeof(p_brief->'must_not_show')='array' and exists (
 select 1 from jsonb_array_elements_text(p_brief->'must_show') s(value)
 join jsonb_array_elements_text(p_brief->'must_not_show') n(value)
 on lower(btrim(s.value))=lower(btrim(n.value)) where length(btrim(s.value))>0
 ) then reasons:=reasons||'"MUST_SHOW_FORBIDDEN_CONTRADICTION"'::jsonb; end if;
 if coalesce(flex->>'exact_source_required','false')='true' and
 (coalesce(pf->>'source_evidence_url','') !~ '^https://' or coalesce(pf->>'source_evidence_verified','false')<>'true')
 then reasons:=reasons||'"EXACT_SOURCE_EVIDENCE_REQUIRED"'::jsonb; end if;
 return jsonb_build_object('status',case when jsonb_array_length(reasons)=0 then 'PASS' else 'FAIL' end,'reasons',reasons,'mustShowCount',must_count,'validatedAt',now());
end $function$

;
