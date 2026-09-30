create or replace function public.content_pipeline_enforce_global_visual_uniqueness_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dup_id bigint;
  v_source_sha text;
begin
  if new.status = 'DONE' and new.sha256 is not null then
    select x.pipeline_image_id into v_dup_id
    from public."21_content_pipeline_image" x
    where x.pipeline_image_id <> new.pipeline_image_id
      and x.status = 'DONE'
      and x.sha256 = new.sha256
    limit 1;
    if v_dup_id is not null then
      raise exception using errcode='23505',
        message='CONTENT_PIPELINE_DUPLICATE_VISUAL_ASSET_GLOBAL',
        detail=format('current=%s duplicatePipelineImageId=%s sha256=%s',new.pipeline_image_id,v_dup_id,new.sha256);
    end if;
  end if;

  v_source_sha := new.staging_asset->'qa'->'provenance'->>'sourceSha256';
  if new.status in ('READY_FOR_UPLOAD','DONE') and v_source_sha is not null then
    select x.pipeline_image_id into v_dup_id
    from public."21_content_pipeline_image" x
    where x.pipeline_image_id <> new.pipeline_image_id
      and x.status in ('READY_FOR_UPLOAD','DONE')
      and x.staging_asset->'qa'->'provenance'->>'sourceSha256' = v_source_sha
    limit 1;
    if v_dup_id is not null then
      raise exception using errcode='23505',
        message='CONTENT_PIPELINE_DUPLICATE_SOURCE_ASSET_GLOBAL',
        detail=format('current=%s duplicatePipelineImageId=%s sourceSha256=%s',new.pipeline_image_id,v_dup_id,v_source_sha);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_content_pipeline_global_visual_uniqueness_v1 on public."21_content_pipeline_image";
create trigger trg_content_pipeline_global_visual_uniqueness_v1
before insert or update of status, sha256, staging_asset
on public."21_content_pipeline_image"
for each row execute function public.content_pipeline_enforce_global_visual_uniqueness_v1();
