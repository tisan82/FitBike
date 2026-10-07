alter function public.content_pipeline_validate_image_brief_feasibility_v1(jsonb)
rename to content_pipeline_validate_image_brief_feasibility_v4_legacy;

create or replace function public.content_pipeline_validate_image_brief_v5(p_brief jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  r jsonb := '[]'::jsonb;
  ms jsonb := coalesce(p_brief->'must_show','[]'::jsonb);
  mns jsonb := coalesce(p_brief->'must_not_show','[]'::jsonb);
  ev jsonb := p_brief->'evidence_requirement';
  refs jsonb;
  lvl text;
  role text;
  mc int := 0;
begin
  if p_brief is null or jsonb_typeof(p_brief)<>'object' then
    return jsonb_build_object('status','FAIL','reasons',jsonb_build_array('IMAGE_BRIEF_MISSING'),'contractVersion',5);
  end if;
  if coalesce((p_brief->>'contract_version')::int,0)<>5 then r:=r||'"CONTRACT_VERSION_5_REQUIRED"'::jsonb; end if;
  if coalesce(btrim(p_brief->>'image_id'),'')='' then r:=r||'"IMAGE_ID_REQUIRED"'::jsonb; end if;
  role:=coalesce(btrim(p_brief->>'asset_role'),'');
  if role not in ('THUMBNAIL_HERO','HERO','THUMBNAIL','BODY') then r:=r||'"ASSET_ROLE_INVALID"'::jsonb; end if;
  if coalesce(btrim(p_brief->>'user_question'),'')='' then r:=r||'"USER_QUESTION_REQUIRED"'::jsonb; end if;
  if coalesce(btrim(p_brief->>'visual_objective'),'')='' then r:=r||'"VISUAL_OBJECTIVE_REQUIRED"'::jsonb; end if;
  if jsonb_typeof(ms)<>'array' or jsonb_array_length(ms)=0 then r:=r||'"MUST_SHOW_REQUIRED"'::jsonb; else mc:=jsonb_array_length(ms); end if;
  if jsonb_typeof(mns)<>'array' then r:=r||'"MUST_NOT_SHOW_ARRAY_REQUIRED"'::jsonb; end if;

  if jsonb_typeof(ev)<>'object' then
    r:=r||'"EVIDENCE_REQUIREMENT_REQUIRED"'::jsonb;
  else
    lvl:=upper(coalesce(ev->>'level',''));
    if lvl not in ('NONE','REFERENCE','REQUIRED') then r:=r||'"EVIDENCE_LEVEL_INVALID"'::jsonb; end if;
    if ev ? 'fact_ids' and jsonb_typeof(ev->'fact_ids')<>'array' then r:=r||'"EVIDENCE_FACT_IDS_ARRAY_REQUIRED"'::jsonb; end if;
    if ev ? 'evidence_ref' then
      refs:=ev->'evidence_ref';
      if jsonb_typeof(refs)<>'array' then
        r:=r||'"EVIDENCE_REF_ARRAY_REQUIRED"'::jsonb;
      elsif exists(
        select 1 from jsonb_array_elements(refs) x
        where jsonb_typeof(x)<>'object'
           or coalesce(btrim(x->>'source_ref'),'')=''
           or coalesce(btrim(x->>'supports'),'')=''
      ) then r:=r||'"EVIDENCE_REF_ITEM_INVALID"'::jsonb;
      end if;
    end if;
  end if;

  if jsonb_typeof(ms)='array' and jsonb_typeof(mns)='array' and exists(
    select 1 from jsonb_array_elements_text(ms) s(v)
    join jsonb_array_elements_text(mns) n(v) on lower(btrim(s.v))=lower(btrim(n.v))
    where length(btrim(s.v))>0
  ) then r:=r||'"MUST_SHOW_FORBIDDEN_CONTRADICTION"'::jsonb; end if;

  return jsonb_build_object(
    'status',case when jsonb_array_length(r)=0 then 'PASS' else 'FAIL' end,
    'reasons',r,'mustShowCount',mc,'contractVersion',5,'validatedAt',now()
  );
end
$function$;

create or replace function public.content_pipeline_validate_image_brief_feasibility_v1(p_brief jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $function$
begin
  if coalesce(nullif(p_brief->>'contract_version','')::int,4)>=5 then
    return public.content_pipeline_validate_image_brief_v5(p_brief);
  end if;
  return public.content_pipeline_validate_image_brief_feasibility_v4_legacy(p_brief);
end
$function$;

alter function public.content_pipeline_build_image_generation_contract_v1(bigint)
rename to content_pipeline_build_image_generation_contract_v4_legacy;

create or replace function public.content_pipeline_build_image_generation_contract_v5(p_pipeline_image_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  i public."21_content_pipeline_image"%rowtype;
  b jsonb;
begin
  select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id;
  if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_IMAGE_NOT_FOUND'; end if;
  b:=coalesce(i.image_brief,'{}'::jsonb);
  if coalesce((b->>'contract_version')::int,0)<>5 then raise exception using errcode='22023',message='CONTENT_PIPELINE_CONTRACT_V5_REQUIRED'; end if;
  if (public.content_pipeline_validate_image_brief_v5(b)->>'status')<>'PASS' then raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_V5_INVALID'; end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'contract_version',5,
    'image_id',coalesce(b->>'image_id',i.image_id),
    'asset_role',coalesce(b->>'asset_role','BODY'),
    'user_question',b->>'user_question',
    'visual_objective',b->>'visual_objective',
    'must_show',coalesce(b->'must_show','[]'::jsonb),
    'must_not_show',coalesce(b->'must_not_show','[]'::jsonb),
    'evidence_requirement',b->'evidence_requirement',
    'alt_text_draft',coalesce(b->>'alt_text_draft',b->>'alt_draft',b->>'alt')
  ));
end
$function$;

create or replace function public.content_pipeline_build_image_generation_contract_v1(p_pipeline_image_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare b jsonb;
begin
  select image_brief into b from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id;
  if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_IMAGE_NOT_FOUND'; end if;
  if coalesce(nullif(b->>'contract_version','')::int,4)>=5 then
    return public.content_pipeline_build_image_generation_contract_v5(p_pipeline_image_id);
  end if;
  return public.content_pipeline_build_image_generation_contract_v4_legacy(p_pipeline_image_id);
end
$function$;
