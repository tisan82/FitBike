-- Prevent cross-task asset carry-over from being accepted as a different visual.
-- Production was patched first; this migration keeps repository schema in sync.

create or replace function public.content_pipeline_complete_image_v1(
 p_pipeline_image_id bigint,p_pipeline_image_run_id bigint,p_claim_token uuid,
 p_generation_status text,p_qa_status text,p_file_status text,p_upload_status text,
 p_storage_bucket text,p_storage_path text,p_sha256 text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
 i public."21_content_pipeline_image"%rowtype;
 v_required int; v_done int; v_manifest jsonb;
 v_dup public."21_content_pipeline_image"%rowtype;
 v_source_url text := nullif(p_metadata->>'sourceAssetUrl','');
 v_dup_source_image_id text;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_IMAGE_NOT_FOUND'; end if;
 if i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token then raise exception using errcode='40001',message='CONTENT_PIPELINE_IMAGE_CLAIM_CONFLICT'; end if;
 if p_generation_status<>'PASS' or p_qa_status<>'PASS' or p_file_status<>'PASS' or p_upload_status not in ('UPLOADED','REUSED') then raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_NOT_COMPLETE'; end if;
 if p_storage_bucket is null or p_storage_path is null or p_sha256 is null then raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_STORAGE_VERIFY_REQUIRED'; end if;

 select * into v_dup from public."21_content_pipeline_image"
 where pipeline_id=i.pipeline_id and pipeline_image_id<>i.pipeline_image_id and status='DONE' and sha256=p_sha256 limit 1;
 if found then raise exception using errcode='23505',message='CONTENT_PIPELINE_DUPLICATE_VISUAL_ASSET',
   detail=format('current=%s duplicate=%s sha256=%s',i.image_id,v_dup.image_id,p_sha256); end if;

 if v_source_url is not null then
   select pi.image_id into v_dup_source_image_id
   from public."21_content_pipeline_image" pi
   join lateral (
     select r.metadata from public."23_content_pipeline_image_run" r
     where r.pipeline_image_id=pi.pipeline_image_id and r.status='PASS'
     order by r.completed_at desc nulls last,r.pipeline_image_run_id desc limit 1
   ) rr on true
   where pi.pipeline_id=i.pipeline_id and pi.pipeline_image_id<>i.pipeline_image_id and pi.status='DONE'
     and nullif(rr.metadata->>'sourceAssetUrl','')=v_source_url limit 1;
   if v_dup_source_image_id is not null then raise exception using errcode='23505',message='CONTENT_PIPELINE_DUPLICATE_SOURCE_ASSET',
     detail=format('current=%s duplicate=%s sourceAssetUrl=%s',i.image_id,v_dup_source_image_id,v_source_url); end if;
 end if;

 update public."21_content_pipeline_image"
 set status='DONE',generation_status=p_generation_status,qa_status=p_qa_status,file_status=p_file_status,
 upload_status=p_upload_status,storage_bucket=p_storage_bucket,storage_path=p_storage_path,sha256=p_sha256,
 claimed_by=null,claim_token=null,claimed_at=null,claim_expires_at=null,retry_action=null,failure_stage=null,
 failure_code=null,last_error=null,completed_at=now(),updated_at=now()
 where pipeline_image_id=p_pipeline_image_id returning * into i;

 update public."23_content_pipeline_image_run" set status='PASS',completed_at=now(),summary='DONE',
 metadata=coalesce(p_metadata,'{}'::jsonb)
 where pipeline_image_run_id=p_pipeline_image_run_id and pipeline_image_id=p_pipeline_image_id
 and claim_token=p_claim_token and status='RUNNING';

 select count(*),count(*) filter(where status='DONE') into v_required,v_done
 from public."21_content_pipeline_image" where pipeline_id=i.pipeline_id and status<>'CANCELLED';

 select coalesce(jsonb_agg(image_brief || jsonb_build_object(
 'image_id',image_id,'asset_key',asset_key,'status',status,'generation_status',generation_status,
 'qa_status',qa_status,'file_status',file_status,'upload_status',upload_status,'storage_bucket',storage_bucket,
 'storage_path',storage_path,'sha256',sha256,'completed_at',completed_at) order by ordinal),'[]'::jsonb)
 into v_manifest from public."21_content_pipeline_image" where pipeline_id=i.pipeline_id and status<>'CANCELLED';

 update public."18_content_pipeline" set image_manifest=v_manifest,
 stage=case when v_required>0 and v_done=v_required then 'IMAGE_READY' else 'VISUAL' end,updated_at=now()
 where pipeline_id=i.pipeline_id and ownership_state='CLAIMED';

 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'status','DONE','pipelineId',i.pipeline_id,
 'readyImageCount',v_done,'requiredImageCount',v_required,
 'contentStage',case when v_required>0 and v_done=v_required then 'IMAGE_READY' else 'VISUAL' end);
end
$function$;
