-- Preserve writer asset_role in Image Generation Contract and enforce representative-image QA before IMAGE_READY.
create or replace function public.content_pipeline_image_role_coverage_ready_v1(p_pipeline_id bigint)
returns boolean language sql security invoker set search_path='' as $$
select count(*) filter (where i.status<>'CANCELLED') > 0
 and count(*) filter (where i.status<>'CANCELLED') = count(*) filter (where i.status='DONE')
 and count(*) filter (where i.status<>'CANCELLED' and upper(coalesce(i.image_brief->>'asset_role',i.image_brief->'image_brief'->>'asset_role','BODY')) in ('THUMBNAIL','THUMBNAIL_HERO')) > 0
 and count(*) filter (where i.status<>'CANCELLED' and upper(coalesce(i.image_brief->>'asset_role',i.image_brief->'image_brief'->>'asset_role','BODY')) in ('HERO','THUMBNAIL_HERO')) > 0
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


-- Patch the existing contract builder without changing its public signature.
do $do$
declare d text;
begin
 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='content_pipeline_build_image_generation_contract_v1' limit 1;
 d:=replace(d,'''contract_version'',1,','''contract_version'',2,');
 d:=replace(d,'''role'',coalesce(inner_b->>''role'',b->>''role''),',
 '''asset_role'',coalesce(inner_b->>''asset_role'',b->>''asset_role'',inner_b->>''role'',b->>''role'',''BODY''),
    ''role'',coalesce(inner_b->>''visual_role'',inner_b->>''role'',b->>''role''),');
 execute d;
end $do$;

-- Enforce representative-image QA and role coverage in the existing completion RPC.
do $do$
declare d text;
begin
 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='content_pipeline_complete_image_v1' limit 1;
 d:=replace(d,
 'if p_storage_bucket is null or p_storage_path is null or p_sha256 is null then
   raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_IMAGE_STORAGE_VERIFY_REQUIRED'';
 end if;',
 'if p_storage_bucket is null or p_storage_path is null or p_sha256 is null then
   raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_IMAGE_STORAGE_VERIFY_REQUIRED'';
 end if;
 if upper(coalesce(i.image_brief->>''asset_role'',i.image_brief->''image_brief''->>''asset_role'',''BODY'')) in (''THUMBNAIL'',''HERO'',''THUMBNAIL_HERO'') then
   if coalesce(p_metadata->>''representativeImageQa'',''FAIL'')<>''PASS'' then raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_REPRESENTATIVE_IMAGE_QA_REQUIRED''; end if;
   if upper(coalesce(i.image_brief->>''asset_role'',i.image_brief->''image_brief''->>''asset_role'')) in (''THUMBNAIL'',''THUMBNAIL_HERO'') and coalesce(p_metadata->>''cardCropQa'',''FAIL'')<>''PASS'' then raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_CARD_CROP_QA_REQUIRED''; end if;
   if upper(coalesce(i.image_brief->>''asset_role'',i.image_brief->''image_brief''->>''asset_role'')) in (''HERO'',''THUMBNAIL_HERO'') and coalesce(p_metadata->>''heroCropQa'',''FAIL'')<>''PASS'' then raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_HERO_CROP_QA_REQUIRED''; end if;
 end if;');
 d:=replace(d,'stage=case when v_required>0 and v_done=v_required then ''IMAGE_READY'' else ''VISUAL'' end,',
 'stage=case when public.content_pipeline_image_role_coverage_ready_v1(i.pipeline_id) then ''IMAGE_READY'' else ''VISUAL'' end,');
 d:=replace(d,'''contentStage'',case when v_required>0 and v_done=v_required then ''IMAGE_READY'' else ''VISUAL'' end',
 '''contentStage'',case when public.content_pipeline_image_role_coverage_ready_v1(i.pipeline_id) then ''IMAGE_READY'' else ''VISUAL'' end');
 execute d;
end $do$;
