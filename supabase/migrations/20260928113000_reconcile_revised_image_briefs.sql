-- Preserve image/run history while allowing a Writer to revise the image plan.
alter table public."21_content_pipeline_image"
  drop constraint "21_content_pipeline_image_status_check";
alter table public."21_content_pipeline_image"
  add constraint "21_content_pipeline_image_status_check"
  check (status in ('PENDING','PROCESSING','RETRY','HOLD','BLOCKED','DONE','CANCELLED'));

create or replace function public.content_pipeline_sync_images_v1(p_pipeline_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  p public."18_content_pipeline"%rowtype;
  v_items jsonb; v_item jsonb; v_ord int := 0; v_asset text; v_image text;
  v_count int; v_keys text[] := array[]::text[];
begin
  select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
  if not found then raise exception 'CONTENT_PIPELINE_NOT_FOUND'; end if;
  if p.ownership_state <> 'CLAIMED' or p.stage not in ('DRAFTED','VISUAL','IMAGE_READY') then
    raise exception 'CONTENT_PIPELINE_IMAGES_NOT_AVAILABLE';
  end if;
  v_items := case when jsonb_typeof(p.writer_artifact->'image_briefs')='array'
    then p.writer_artifact->'image_briefs'
    when jsonb_typeof(p.writer_artifact->'image_manifest')='array'
    then p.writer_artifact->'image_manifest' else '[]'::jsonb end;
  if jsonb_array_length(v_items)=0 then raise exception 'CONTENT_PIPELINE_NO_IMAGES_UNSUPPORTED'; end if;
  if exists(select 1 from public."21_content_pipeline_image" where pipeline_id=p_pipeline_id
    and status='PROCESSING') then raise exception 'CONTENT_PIPELINE_IMAGE_REPLAN_PROCESSING'; end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_asset:=coalesce(v_item->>'asset_key',case when v_ord=0 then 'thumbnail'
      when v_ord=1 then 'hero' else 'body-'||lpad((v_ord-1)::text,2,'0') end);
    v_image:=coalesce(nullif(v_item->>'image_id',''),'IMAGE_'||lpad((v_ord+1)::text,2,'0'));
    if v_asset !~ '^(thumbnail|hero|body-[0-9]{2})$' or v_asset=any(v_keys)
      then raise exception 'CONTENT_PIPELINE_INVALID_OR_DUPLICATE_ASSET_KEY'; end if;
    v_keys:=array_append(v_keys,v_asset);
    if exists(select 1 from public."21_content_pipeline_image"
      where pipeline_id=p_pipeline_id and asset_key=v_asset and status='DONE'
        and (image_brief is distinct from v_item or image_id is distinct from v_image))
      then raise exception 'CONTENT_PIPELINE_DONE_IMAGE_REPLAN_CONFLICT'; end if;
    insert into public."21_content_pipeline_image"(pipeline_id,image_id,asset_key,ordinal,image_brief)
      values(p_pipeline_id,v_image,v_asset,v_ord,v_item)
    on conflict (pipeline_id,asset_key) do update set
      image_id=excluded.image_id,ordinal=excluded.ordinal,image_brief=excluded.image_brief,
      status=case when public."21_content_pipeline_image".status='DONE' then 'DONE'
        when public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief
          or public."21_content_pipeline_image".status='CANCELLED' then 'PENDING'
        else public."21_content_pipeline_image".status end,
      retry_action=case when public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief
        or public."21_content_pipeline_image".status='CANCELLED' then null
        else public."21_content_pipeline_image".retry_action end,
      next_eligible_at=case when public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief
        or public."21_content_pipeline_image".status='CANCELLED' then null
        else public."21_content_pipeline_image".next_eligible_at end,
      updated_at=now();
    v_ord:=v_ord+1;
  end loop;
  if exists(select 1 from public."21_content_pipeline_image" where pipeline_id=p_pipeline_id
     and asset_key <> all(v_keys) and status='DONE')
    then raise exception 'CONTENT_PIPELINE_DONE_IMAGE_REMOVAL_CONFLICT'; end if;
  update public."21_content_pipeline_image" set status='CANCELLED',retry_action='WRITER_REPLANNED',
    claimed_by=null,claim_token=null,claimed_at=null,claim_expires_at=null,
    next_eligible_at=null,updated_at=now()
    where pipeline_id=p_pipeline_id and asset_key <> all(v_keys) and status<>'CANCELLED';
  select count(*) into v_count from public."21_content_pipeline_image"
    where pipeline_id=p_pipeline_id and status<>'CANCELLED';
  return jsonb_build_object('pipelineId',p_pipeline_id,'requiredImageCount',v_count);
end $function$;

-- Keep the deployed completion function and its Storage verification trigger intact.
-- Only exclude archived image tasks from readiness and the compatibility manifest.
do $patch$
declare v_sql text; v_old text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_sql from pg_proc p
    where p.pronamespace='public'::regnamespace
      and p.proname='content_pipeline_complete_image_v1';
  v_old:='from public."21_content_pipeline_image" where pipeline_id=i.pipeline_id;';
  v_new:='from public."21_content_pipeline_image" where pipeline_id=i.pipeline_id and status<>''CANCELLED'';';
  if v_sql is null or (length(v_sql)-length(replace(v_sql,v_old,'')))/length(v_old)<>2
    then raise exception 'COMPLETE_IMAGE_FUNCTION_UNEXPECTED_DEFINITION'; end if;
  execute replace(v_sql,v_old,v_new);
end $patch$;
