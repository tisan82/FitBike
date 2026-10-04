CREATE OR REPLACE FUNCTION public.content_pipeline_visual_recovery_v1(p_pipeline_image_id bigint)
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
 where i.pipeline_image_id=p_pipeline_image_id and j.status='STAGED'
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
  and bad.spec->>'sourcePdfPage' is not distinct from p_spec->>'sourcePdfPage'
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