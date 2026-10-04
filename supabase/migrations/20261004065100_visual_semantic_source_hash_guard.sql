create or replace function public.content_pipeline_pre_staging_gate_v1(p_image_id bigint,p_contract_hash text,p_spec jsonb,p_source_sha text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; q jsonb:=p_spec->'preStagingQa'; preview public."27_content_pipeline_source_stage_job"%rowtype; item text;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_image_id;
 if not found or i.generation_contract_hash is distinct from p_contract_hash then raise exception 'PRE_STAGING_CONTRACT_CHANGED';end if;
 if p_spec->>'preflightOnly'='true' then
  if jsonb_array_length(coalesce(p_spec->'transform'->'annotations','[]'))>0 then raise exception 'PREFLIGHT_ANNOTATIONS_FORBIDDEN';end if;
  return jsonb_build_object('status','PREFLIGHT_ONLY','approvalAllowed',false);
 end if;
 if exists(select 1 from public."27_content_pipeline_source_stage_job" bad where bad.pipeline_image_id=p_image_id and bad.contract_hash=p_contract_hash
  and bad.result->'semanticValidation'->>'status'='FAIL' and bad.result->'semanticValidation'->>'reason'='SOURCE_MISMATCH'
  and coalesce(bad.result->>'preStagingSourceSha256',bad.result->'provenance'->>'sourceSha256')=p_source_sha) then raise exception 'SEMANTICALLY_REJECTED_SOURCE';end if;
 if q is null then
  select j.result->'preStagingQa' into q from public."27_content_pipeline_source_stage_job" j
  where j.pipeline_image_id=p_image_id and j.contract_hash=p_contract_hash and j.status='STAGED'
   and (j.spec->>'preflightOnly'='true' or j.result->>'preflightOnly'='true')
   and j.result->'semanticValidation'->>'status' is distinct from 'FAIL'
   and j.result->>'preStagingSourceSha256'=p_source_sha
   and j.spec->>'sourceAssetUrl' is not distinct from p_spec->>'sourceAssetUrl'
   and j.spec->>'sourcePdfPage' is not distinct from p_spec->>'sourcePdfPage'
   and j.spec->>'productionMethod' is not distinct from p_spec->>'productionMethod'
   and j.result->'preStagingQa' is not null order by j.created_at desc limit 1;
  if q is null then return jsonb_build_object('status','PREFLIGHT_ONLY','approvalAllowed',false,'nextAction','INSPECT_CANDIDATE_AND_REGISTER_PRE_STAGING_QA');end if;
 end if;
 if q->>'pipelineImageId' is distinct from p_image_id::text or q->>'contractHash' is distinct from p_contract_hash
 or q->>'sourceSha256' is distinct from p_source_sha or q->>'pixelsInspected' is distinct from 'true' or q->>'status' is distinct from 'PASS'
 or length(coalesce(q->>'evidence',''))<10 then raise exception 'PRE_STAGING_VISUAL_QA_REQUIRED';end if;
 select * into preview from public."27_content_pipeline_source_stage_job" where job_id::text=q->>'sourceJobId';
 if not found or preview.pipeline_image_id is distinct from p_image_id or preview.contract_hash is distinct from p_contract_hash
 or preview.status<>'STAGED' or not coalesce(preview.spec->>'preflightOnly'='true' or preview.result->>'preflightOnly'='true',false)
 or preview.result->'semanticValidation'->>'status'='FAIL'
 or preview.result->>'preStagingSourceSha256' is distinct from p_source_sha
 or preview.spec->>'sourceAssetUrl' is distinct from p_spec->>'sourceAssetUrl'
 or preview.spec->>'sourcePdfPage' is distinct from p_spec->>'sourcePdfPage'
 or preview.spec->>'productionMethod' is distinct from p_spec->>'productionMethod'
 or preview.spec->'references' is distinct from p_spec->'references'
 then raise exception 'PRE_STAGING_SOURCE_IDENTITY_MISMATCH';end if;
 for item in select jsonb_array_elements_text(coalesce(i.generation_contract->'must_show','[]')) loop
  if q->'mustShowChecks'->>item is distinct from 'PASS' then raise exception 'PRE_STAGING_MUST_SHOW_NOT_VERIFIED';end if;
 end loop;
 for item in select jsonb_array_elements_text(coalesce(i.generation_contract->'must_not_show','[]')) loop
  if q->'mustNotShowChecks'->>item is distinct from 'PASS' then raise exception 'PRE_STAGING_MUST_NOT_SHOW_NOT_VERIFIED';end if;
 end loop;
 if jsonb_array_length(coalesce(p_spec->'transform'->'annotations','[]'))>0 or i.generation_contract->'annotation_contract'->>'required'='true' then
  if q->>'inspectionTargetVerified' is distinct from 'true' then raise exception 'PRE_STAGING_TARGET_NOT_VERIFIED';end if;
  for item in select jsonb_array_elements_text(coalesce(i.generation_contract->'annotation_contract'->'target_labels','[]')) loop
   if q->'annotationTargetChecks'->>item is distinct from 'PASS' then raise exception 'PRE_STAGING_ANNOTATION_TARGET_NOT_VERIFIED';end if;
  end loop;
 end if;
 return jsonb_build_object('status','PASS','evaluator','OPERATOR_PIXEL_ATTESTATION','sourceJobId',preview.job_id,'sourceSha256',p_source_sha,'contractHash',p_contract_hash);
end $$;
