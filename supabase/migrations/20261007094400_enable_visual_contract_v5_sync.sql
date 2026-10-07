create or replace function public.content_pipeline_sync_images_v1(p_pipeline_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  p public."18_content_pipeline"%rowtype;
  v_items jsonb; v_item jsonb; v_ord int := 0; v_asset text; v_image text;
  v_count int; v_keys text[] := array[]::text[]; v_pid bigint; v_contract jsonb; v_hash text; v_validation jsonb;
  v_existing_status text; v_existing_brief jsonb; v_existing_image text; v_contract_version int; v_max_version int:=4;
begin
  select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
  if not found then raise exception 'CONTENT_PIPELINE_NOT_FOUND'; end if;
  if p.ownership_state <> 'CLAIMED' or p.stage not in ('DRAFTED','VISUAL','IMAGE_READY') then raise exception 'CONTENT_PIPELINE_IMAGES_NOT_AVAILABLE'; end if;
  v_items := case when jsonb_typeof(p.writer_artifact->'image_briefs')='array' then p.writer_artifact->'image_briefs'
    when jsonb_typeof(p.writer_artifact->'image_manifest')='array' then p.writer_artifact->'image_manifest' else '[]'::jsonb end;
  if jsonb_array_length(v_items)=0 then raise exception 'CONTENT_PIPELINE_NO_IMAGES_UNSUPPORTED'; end if;
  if exists(select 1 from public."21_content_pipeline_image" where pipeline_id=p_pipeline_id and status='PROCESSING') then raise exception 'CONTENT_PIPELINE_IMAGE_REPLAN_PROCESSING'; end if;

  for v_item in select value from jsonb_array_elements(v_items) loop
    v_contract_version:=coalesce(nullif(v_item->>'contract_version','')::int,4);
    v_max_version:=greatest(v_max_version,v_contract_version);
    v_asset:=coalesce(v_item->>'asset_key',case when v_ord=0 then 'thumbnail' when v_ord=1 then 'hero' else 'body-'||lpad((v_ord-1)::text,2,'0') end);
    v_image:=coalesce(nullif(v_item->>'image_id',''),'IMAGE_'||lpad((v_ord+1)::text,2,'0'));
    if v_asset !~ '^(thumbnail|hero|body-[0-9]{2})$' or v_asset=any(v_keys) then raise exception 'CONTENT_PIPELINE_INVALID_OR_DUPLICATE_ASSET_KEY'; end if;
    v_keys:=array_append(v_keys,v_asset);

    select status,image_brief,image_id into v_existing_status,v_existing_brief,v_existing_image
    from public."21_content_pipeline_image" where pipeline_id=p_pipeline_id and asset_key=v_asset;

    if v_existing_status in ('DONE','READY_FOR_UPLOAD') then
      if v_existing_brief is distinct from v_item or v_existing_image is distinct from v_image then raise exception 'CONTENT_PIPELINE_DONE_IMAGE_REPLAN_CONFLICT'; end if;
      v_ord:=v_ord+1; continue;
    end if;

    v_validation:=public.content_pipeline_validate_image_brief_feasibility_v1(v_item);
    if v_validation->>'status'<>'PASS' then raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_FEASIBILITY_FAILED',detail=v_validation::text; end if;

    insert into public."21_content_pipeline_image"(pipeline_id,image_id,asset_key,ordinal,image_brief)
      values(p_pipeline_id,v_image,v_asset,v_ord,v_item)
    on conflict (pipeline_id,asset_key) do update set
      image_id=excluded.image_id,ordinal=excluded.ordinal,image_brief=excluded.image_brief,
      status=case when public."21_content_pipeline_image".status in ('DONE','READY_FOR_UPLOAD') then public."21_content_pipeline_image".status
        when public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief or public."21_content_pipeline_image".status='CANCELLED' then 'PENDING'
        else public."21_content_pipeline_image".status end,
      retry_action=case when public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief or public."21_content_pipeline_image".status='CANCELLED' then null else public."21_content_pipeline_image".retry_action end,
      next_eligible_at=case when public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief or public."21_content_pipeline_image".status='CANCELLED' then null else public."21_content_pipeline_image".next_eligible_at end,
      staging_asset=case when public."21_content_pipeline_image".status not in ('DONE','READY_FOR_UPLOAD') and public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief then null else public."21_content_pipeline_image".staging_asset end,
      staging_input=case when public."21_content_pipeline_image".status not in ('DONE','READY_FOR_UPLOAD') and public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief then null else public."21_content_pipeline_image".staging_input end,
      failure_stage=case when public."21_content_pipeline_image".status not in ('DONE','READY_FOR_UPLOAD') and public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief then null else public."21_content_pipeline_image".failure_stage end,
      failure_code=case when public."21_content_pipeline_image".status not in ('DONE','READY_FOR_UPLOAD') and public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief then null else public."21_content_pipeline_image".failure_code end,
      last_error=case when public."21_content_pipeline_image".status not in ('DONE','READY_FOR_UPLOAD') and public."21_content_pipeline_image".image_brief is distinct from excluded.image_brief then null else public."21_content_pipeline_image".last_error end,
      updated_at=now()
    returning pipeline_image_id into v_pid;

    v_contract:=public.content_pipeline_build_image_generation_contract_v1(v_pid);
    if coalesce((v_contract->>'contract_version')::int,4)<5 and coalesce(v_contract->'production_feasibility'->>'status','')<>'PASS' then raise exception 'CONTENT_PIPELINE_CONTRACT_FEASIBILITY_NOT_PASS'; end if;
    v_hash:=encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex');
    update public."21_content_pipeline_image" set generation_contract=v_contract,generation_contract_hash=v_hash,updated_at=now() where pipeline_image_id=v_pid;
    v_ord:=v_ord+1;
  end loop;

  if exists(select 1 from public."21_content_pipeline_image" where pipeline_id=p_pipeline_id and asset_key <> all(v_keys) and status in ('DONE','READY_FOR_UPLOAD')) then raise exception 'CONTENT_PIPELINE_DONE_IMAGE_REMOVAL_CONFLICT'; end if;
  update public."21_content_pipeline_image" set status='CANCELLED',retry_action='WRITER_REPLANNED',claimed_by=null,claim_token=null,claimed_at=null,claim_expires_at=null,next_eligible_at=null,updated_at=now()
    where pipeline_id=p_pipeline_id and asset_key <> all(v_keys) and status not in ('CANCELLED','DONE','READY_FOR_UPLOAD');
  select count(*) into v_count from public."21_content_pipeline_image" where pipeline_id=p_pipeline_id and status<>'CANCELLED';
  return jsonb_build_object('pipelineId',p_pipeline_id,'requiredImageCount',v_count,'productionFeasibility','PASS','contractVersion',v_max_version);
end
$function$;
