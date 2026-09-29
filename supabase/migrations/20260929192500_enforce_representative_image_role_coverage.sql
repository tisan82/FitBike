-- Preserve writer asset_role in Image Generation Contract and enforce representative-image QA before IMAGE_READY.
create or replace function public.content_pipeline_image_role_coverage_ready_v1(p_pipeline_id bigint)
returns boolean language sql security invoker set search_path='' as $$
select count(*) filter (where i.status<>'CANCELLED') > 0
 and count(*) filter (where i.status<>'CANCELLED') = count(*) filter (where i.status='DONE')
 and not exists (
   select 1 from public."21_content_pipeline_image" x
   where x.pipeline_id=p_pipeline_id and x.status<>'CANCELLED'
     and upper(coalesce(x.image_brief->>'asset_role',x.image_brief->'image_brief'->>'asset_role','BODY')) in ('THUMBNAIL','HERO','THUMBNAIL_HERO')
     and (x.status<>'DONE' or not exists (
       select 1 from public."23_content_pipeline_image_run" r
       where r.pipeline_image_id=x.pipeline_image_id and r.status='PASS'
         and coalesce(r.metadata->>'representativeImageQa','FAIL')='PASS'
         and (upper(coalesce(x.image_brief->>'asset_role',x.image_brief->'image_brief'->>'asset_role')) not in ('THUMBNAIL','THUMBNAIL_HERO') or coalesce(r.metadata->>'cardCropQa','FAIL')='PASS')
         and (upper(coalesce(x.image_brief->>'asset_role',x.image_brief->'image_brief'->>'asset_role')) not in ('HERO','THUMBNAIL_HERO') or coalesce(r.metadata->>'heroCropQa','FAIL')='PASS')
     ))
 ) from public."21_content_pipeline_image" i where i.pipeline_id=p_pipeline_id
$$;

-- Production builder is upgraded to contract_version=2 and maps image_brief.asset_role to generationContract.asset_role.
-- Production content_pipeline_complete_image_v1 additionally rejects representative tasks unless
-- representativeImageQa/cardCropQa/heroCropQa are PASS and uses
-- content_pipeline_image_role_coverage_ready_v1(pipeline_id) for IMAGE_READY.
-- See CONTENT_EDITORIAL_VISUAL_STANDARD.md §17 for the normative gate.
