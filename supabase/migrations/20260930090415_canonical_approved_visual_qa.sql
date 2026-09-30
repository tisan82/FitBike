create or replace function public.content_pipeline_record_staging_v1(p_pipeline_image_id bigint,p_claim_token uuid,p_asset jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; v_path text;
begin
 -- Approved QA lives only in qa; candidate QA remains in the source job receipt.
 p_asset:=p_asset-'imageQa'-'mobileQa'-'imageSeoQa';
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token or i.claim_expires_at<=now() then raise exception 'INVALID_IMAGE_CLAIM'; end if;
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
 update public."21_content_pipeline_image" set staging_asset=p_asset,staging_input=null,status='READY_FOR_UPLOAD',handoff_phase='READY_FOR_UPLOAD',
 generation_status='PASS',qa_status='PASS',file_status='PASS',upload_status='PENDING',claimed_by=null,claim_token=null,
 claimed_at=null,claim_expires_at=null,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now()
 where pipeline_image_id=i.pipeline_image_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'status','READY_FOR_UPLOAD','stagingAsset',p_asset);
end $$;

create or replace function public.content_pipeline_image_handoff_status_v1(p_pipeline_id bigint default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('pipelineId',i.pipeline_id,'pipelineImageId',i.pipeline_image_id,
 'contentKey',p.content_key,'imageId',i.image_id,'assetKey',i.asset_key,'status',i.status,'handoffPhase',i.handoff_phase,
 'stagingSha',i.staging_asset->>'sha256','stagingPath',i.staging_asset->>'path','mobileQa',i.staging_asset->'qa'->>'mobileQa',
 'imageQa',i.staging_asset->'qa'->>'imageQa','imageSeoQa',i.staging_asset->'qa'->>'imageSeoQa',
 'qaSource','staging_asset.qa','productionPath',i.storage_path,'productionSha',i.sha256,
 'failureStage',i.failure_stage,'failureCode',i.failure_code,'lastError',i.last_error,'nextEligibleAt',i.next_eligible_at,
 'updatedAt',i.updated_at,'contentStage',p.stage) order by i.updated_at desc),'[]'::jsonb)
 from (select * from public."21_content_pipeline_image" where p_pipeline_id is null or pipeline_id=p_pipeline_id order by updated_at desc limit 100) i
 join public."18_content_pipeline" p on p.pipeline_id=i.pipeline_id;
$$;
-- Remove only redundant candidate QA keys where explicit approved QA already exists.
-- No binary, SHA, claim, status, or approval evidence is changed.
update public."21_content_pipeline_image"
set staging_asset=staging_asset-'imageQa'-'mobileQa'-'imageSeoQa'
where jsonb_typeof(staging_asset->'qa')='object'
  and (staging_asset ? 'imageQa' or staging_asset ? 'mobileQa' or staging_asset ? 'imageSeoQa');
