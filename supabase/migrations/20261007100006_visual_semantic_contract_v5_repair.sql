begin;
-- V5 authoring contains semantics only. Existing V4 contracts and identities are not rewritten.
create or replace function public.content_pipeline_validate_visual_contract_v5(p_contract jsonb,p_allow_metadata boolean default false)
returns jsonb language plpgsql immutable set search_path='' as $$
declare reasons jsonb:='[]'; k text; item jsonb; refs jsonb; e jsonb; allowed text[]; people_required boolean; people_forbidden boolean;
begin
 if jsonb_typeof(p_contract) is distinct from 'object' then return jsonb_build_object('status','FAIL','reasons',jsonb_build_array('V5_OBJECT_REQUIRED'));end if;
 allowed:=array['contract_version','image_id','asset_role','user_question','visual_objective','must_show','must_not_show','evidence_requirement','alt_text_draft'];
 if p_allow_metadata then allowed:=allowed||array['pipeline_image_id','pipeline_id','content_key','topic_key','asset_key'];end if;
 if exists(select 1 from jsonb_object_keys(p_contract) x where not x=any(allowed)) then reasons:=reasons||'"V5_UNKNOWN_FIELD"'::jsonb;end if;
 if p_contract->'contract_version' is distinct from '5'::jsonb then reasons:=reasons||'"V5_VERSION_REQUIRED"'::jsonb;end if;
 foreach k in array array['image_id','user_question','visual_objective','alt_text_draft'] loop
 if jsonb_typeof(p_contract->k) is distinct from 'string' or btrim(coalesce(p_contract->>k,''))='' or length(coalesce(p_contract->>k,'')) not between 1 and (case when k='image_id' then 100 when k='user_question' then 500 when k='visual_objective' then 1000 else 300 end) then reasons:=reasons||to_jsonb('V5_INVALID_'||upper(k));end if;
 end loop;
 if coalesce(p_contract->>'image_id','') !~ '^IMG_[0-9]{2,}$' then reasons:=reasons||'"V5_IMAGE_ID_INVALID"'::jsonb;end if;
 if p_contract->>'asset_role' is null or p_contract->>'asset_role' not in('THUMBNAIL','HERO','THUMBNAIL_HERO','BODY') then reasons:=reasons||'"V5_ASSET_ROLE_INVALID"'::jsonb;end if;
 foreach k in array array['must_show','must_not_show'] loop
 if jsonb_typeof(p_contract->k) is distinct from 'array' then reasons:=reasons||to_jsonb('V5_INVALID_'||upper(k));
 else
 if jsonb_array_length(p_contract->k)>(case when k='must_show' then 8 else 12 end) or (k='must_show' and jsonb_array_length(p_contract->k)=0) then reasons:=reasons||to_jsonb('V5_INVALID_'||upper(k)||'_COUNT');end if;
 for item in select value from jsonb_array_elements(p_contract->k) loop
 if jsonb_typeof(item) is distinct from 'string' or btrim(coalesce(item#>>'{}',''))='' or length(item#>>'{}') not between 1 and 500 then reasons:=reasons||to_jsonb('V5_INVALID_'||upper(k)||'_ITEM');end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_contract->k))<>(select count(distinct lower(btrim(value#>>'{}'))) from jsonb_array_elements(p_contract->k)) then reasons:=reasons||to_jsonb('V5_DUPLICATE_'||upper(k));end if;
 end if;
 end loop;
 if jsonb_typeof(p_contract->'must_show')='array' and jsonb_typeof(p_contract->'must_not_show')='array' then
 if exists(select 1 from jsonb_array_elements_text(p_contract->'must_show') s join jsonb_array_elements_text(p_contract->'must_not_show') n on lower(btrim(s.value))=lower(btrim(n.value))) then reasons:=reasons||'"V5_VISIBLE_CONTRADICTION"'::jsonb;end if;
 people_required:=lower((p_contract->'must_show')::text) ~ '(사람|라이더|정비사|운전자|배달원|승객|손(이|을|으로|과| |")|팔(이|을|로|과| |")|\m(person|people|rider|mechanic|driver|motorcyclist|passenger|hand|hands|arm|arms)\M)';
 people_forbidden:=exists(select 1 from jsonb_array_elements_text(p_contract->'must_not_show') n where lower(btrim(n.value)) in ('사람','사람 없음','person','people','no people','no person'));
 if people_required and people_forbidden then reasons:=reasons||'"V5_PEOPLE_CONTRADICTION"'::jsonb;end if;
 end if;
 e:=p_contract->'evidence_requirement';
 if jsonb_typeof(e) is distinct from 'object' then reasons:=reasons||'"V5_EVIDENCE_REQUIREMENT_INVALID"'::jsonb;
 else
 if exists(select 1 from jsonb_object_keys(e) x where x not in ('level','fact_ids','evidence_ref')) then reasons:=reasons||'"V5_EVIDENCE_UNKNOWN_FIELD"'::jsonb;end if;
 if e->>'level' is null or e->>'level' not in('NONE','REFERENCE','REQUIRED') then reasons:=reasons||'"V5_EVIDENCE_LEVEL_INVALID"'::jsonb;end if;
 if e ? 'fact_ids' then
 if jsonb_typeof(e->'fact_ids') is distinct from 'array' then reasons:=reasons||'"V5_FACT_IDS_INVALID"'::jsonb;
 else
 if jsonb_array_length(e->'fact_ids')>20 then reasons:=reasons||'"V5_FACT_IDS_TOO_MANY"'::jsonb;end if;
 if (select count(*) from jsonb_array_elements(e->'fact_ids'))<>(select count(distinct value) from jsonb_array_elements(e->'fact_ids')) then reasons:=reasons||'"V5_DUPLICATE_FACT_IDS"'::jsonb;end if;
 for item in select value from jsonb_array_elements(e->'fact_ids') loop
 if jsonb_typeof(item) is distinct from 'string' or coalesce(item#>>'{}','') !~ '^CF[1-9][0-9]*$' then reasons:=reasons||'"V5_FACT_ID_INVALID"'::jsonb;end if;
 end loop;
 end if;
 end if;
 if e ? 'evidence_ref' then
 refs:=e->'evidence_ref';
 if jsonb_typeof(refs) is distinct from 'array' then reasons:=reasons||'"V5_EVIDENCE_REF_INVALID"'::jsonb;
 else
 if jsonb_array_length(refs)>4 then reasons:=reasons||'"V5_EVIDENCE_REF_TOO_MANY"'::jsonb;end if;
 for item in select value from jsonb_array_elements(refs) loop
 if jsonb_typeof(item) is distinct from 'object' then reasons:=reasons||'"V5_EVIDENCE_REF_ITEM_INVALID"'::jsonb;
 else
 if exists(select 1 from jsonb_object_keys(item) x where x not in('source_ref','model_scope','supports')) then reasons:=reasons||'"V5_EVIDENCE_REF_UNKNOWN_FIELD"'::jsonb;end if;
 if jsonb_typeof(item->'source_ref') is distinct from 'string' or length(coalesce(item->>'source_ref',''))>2000 or coalesce(item->>'source_ref','') !~ '^https://[^[:space:]]+$' then reasons:=reasons||'"V5_EVIDENCE_SOURCE_REF_INVALID"'::jsonb;end if;
 foreach k in array array['model_scope','supports'] loop
 if item ? k and (jsonb_typeof(item->k) is distinct from 'string' or btrim(coalesce(item->>k,''))='' or length(coalesce(item->>k,'')) not between 1 and (case when k='model_scope' then 500 else 1000 end)) then reasons:=reasons||to_jsonb('V5_EVIDENCE_'||upper(k)||'_INVALID');end if;
 end loop;
 end if;
 end loop;
 end if;
 end if;
 end if;
 return jsonb_build_object('status',case when jsonb_array_length(reasons)=0 then 'PASS' else 'FAIL' end,'reasons',reasons,'validationScope','SEMANTIC_SCHEMA_AND_BASIC_CONSISTENCY','pixelsInspected',false);
end $$;
revoke all on function public.content_pipeline_validate_visual_contract_v5(jsonb,boolean) from public,anon,authenticated;
grant execute on function public.content_pipeline_validate_visual_contract_v5(jsonb,boolean) to service_role;

create or replace function public.content_pipeline_visual_policy_v1(p_contract jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare e text; pm text; v jsonb;
begin
 if p_contract->'contract_version' is distinct from '5'::jsonb then return p_contract;end if;
 v:=public.content_pipeline_validate_visual_contract_v5(p_contract,true);
 if v->>'status' is distinct from 'PASS' then raise exception using message='V5_CONTRACT_INVALID',detail=v::text;end if;
 e:=p_contract->'evidence_requirement'->>'level';
 pm:=case when lower((p_contract->'must_show')::text) ~ '(사람|라이더|정비사|운전자|배달원|승객|손(이|을|으로|과| |")|팔(이|을|로|과| |")|\m(person|people|rider|mechanic|driver|motorcyclist|passenger|hand|hands|arm|arms)\M)' then 'REQUIRED' else 'NONE' end;
 return p_contract||jsonb_build_object(
 'server_policy_version','VISUAL_COMMON_V1','evidence_level',e,
 'people_mode',pm,'mobile_requirement','At 390px, every must_show item remains visually identifiable.',
 'generation_allowed',e in('NONE','REFERENCE'),'full_generation_allowed',e='NONE',
 'reference_based_generation_allowed',e='REFERENCE','real_source_required',e='REQUIRED',
 'production_source_required',e='REQUIRED','reference_fact_required',e in('REFERENCE','REQUIRED'),
 'ai_edit_allowed',true,'structure_preserving_edit_required',e='REQUIRED',
 'source_strategy',case e when 'NONE' then 'GENERATION_OR_REAL_SOURCE' when 'REFERENCE' then 'REFERENCE_FIRST_GENERATIVE' else 'REAL_SOURCE_REQUIRED' end,
 'source_priority',case e when 'NONE' then '["NATIVE_FULL_GENERATION","REAL_SOURCE_DIRECT","REAL_SOURCE_CROP_OR_MARK","REAL_SOURCE_AI_EDIT"]'::jsonb when 'REFERENCE' then '["REAL_SOURCE_DIRECT","REAL_SOURCE_CROP_OR_MARK","REFERENCE_BASED_GENERATION","REAL_SOURCE_AI_EDIT"]'::jsonb else '["REAL_SOURCE_DIRECT","REAL_SOURCE_CROP_OR_MARK","REAL_SOURCE_AI_EDIT"]'::jsonb end,
 'annotation_contract',jsonb_build_object('required',false,'target_labels','[]'::jsonb),
 'pixel_qa_contract',jsonb_build_object('required_visible',p_contract->'must_show','prohibited_visible',p_contract->'must_not_show','people_mode',pm,'semantic_objective_is_gate',false,'annotation_contract',jsonb_build_object('required',false,'target_labels','[]'::jsonb)),
 'objective_is_gate',false,'user_question_supported',p_contract->>'user_question','fact_dependencies',coalesce(p_contract->'evidence_requirement'->'fact_ids','[]'::jsonb));
end $$;
revoke all on function public.content_pipeline_visual_policy_v1(jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_visual_policy_v1(jsonb) to service_role;



-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_validate_image_brief_v5';
 if f is null or md5(f)<>'6b9c19bf717960f5b73efb952b8ccdc7' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_validate_image_brief_v5';end if;
 if (length(f)-length(replace(f,$old$CREATE OR REPLACE FUNCTION public.content_pipeline_validate_image_brief_v5(p_brief jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
$old$,'')))/length($old$CREATE OR REPLACE FUNCTION public.content_pipeline_validate_image_brief_v5(p_brief jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_validate_image_brief_v5';end if;
 f:=replace(f,$old$CREATE OR REPLACE FUNCTION public.content_pipeline_validate_image_brief_v5(p_brief jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
$old$,$new$CREATE OR REPLACE FUNCTION public.content_pipeline_validate_image_brief_v5(p_brief jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $function$
 select public.content_pipeline_validate_visual_contract_v5(p_brief,false);
$function$
$new$);
 execute f;
end $migration$;

-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_validate_image_brief_feasibility_v1';
 if f is null or md5(f)<>'e59bab7008b9246b9ceb799c01df2964' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_validate_image_brief_feasibility_v1';end if;
 if (length(f)-length(replace(f,$old$  if coalesce(nullif(p_brief->>'contract_version','')::int,4)>=5 then$old$,'')))/length($old$  if coalesce(nullif(p_brief->>'contract_version','')::int,4)>=5 then$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_validate_image_brief_feasibility_v1';end if;
 f:=replace(f,$old$  if coalesce(nullif(p_brief->>'contract_version','')::int,4)>=5 then$old$,$new$  if p_brief->'contract_version'='5'::jsonb then$new$);
 if (length(f)-length(replace(f,$old$  return public.content_pipeline_validate_image_brief_feasibility_v4_legacy(p_brief);$old$,'')))/length($old$  return public.content_pipeline_validate_image_brief_feasibility_v4_legacy(p_brief);$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_validate_image_brief_feasibility_v1';end if;
 f:=replace(f,$old$  return public.content_pipeline_validate_image_brief_feasibility_v4_legacy(p_brief);$old$,$new$  if p_brief ? 'contract_version' and coalesce(p_brief->>'contract_version','') not in('1','2','3','4') then return jsonb_build_object('status','FAIL','reasons',jsonb_build_array('UNSUPPORTED_CONTRACT_VERSION'));end if;
  return public.content_pipeline_validate_image_brief_feasibility_v4_legacy(p_brief);$new$);
 execute f;
end $migration$;

-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_claim_visual_producer_v1';
 if f is null or md5(f)<>'5247e7ceaefecf436e3698d32c9e8d09' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_claim_visual_producer_v1';end if;
 if (length(f)-length(replace(f,$old$or coalesce((i0.generation_contract->>'contract_version')::int,3)>=5$old$,'')))/length($old$or coalesce((i0.generation_contract->>'contract_version')::int,3)>=5$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_claim_visual_producer_v1';end if;
 f:=replace(f,$old$or coalesce((i0.generation_contract->>'contract_version')::int,3)>=5$old$,$new$or (i0.generation_contract->'contract_version'='5'::jsonb and public.content_pipeline_validate_visual_contract_v5(i0.generation_contract,true)->>'status'='PASS')$new$);
 execute f;
end $migration$;

-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_claim_visual_reviewer_v1';
 if f is null or md5(f)<>'8858f6d2731dd791c40a56fbe3636b44' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_claim_visual_reviewer_v1';end if;
 if (length(f)-length(replace(f,$old$or coalesce((i0.generation_contract->>'contract_version')::int,3)>=5$old$,'')))/length($old$or coalesce((i0.generation_contract->>'contract_version')::int,3)>=5$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_claim_visual_reviewer_v1';end if;
 f:=replace(f,$old$or coalesce((i0.generation_contract->>'contract_version')::int,3)>=5$old$,$new$or (i0.generation_contract->'contract_version'='5'::jsonb and public.content_pipeline_validate_visual_contract_v5(i0.generation_contract,true)->>'status'='PASS')$new$);
 execute f;
end $migration$;

-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_complete_stage_v1';
 if f is null or md5(f)<>'262671f65b94d3cc29e22f82f25ca068' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_complete_stage_v1';end if;
 if (length(f)-length(replace(f,$old$coalesce(i.generation_contract->'production_feasibility'->>'status','')<>'PASS'$old$,'')))/length($old$coalesce(i.generation_contract->'production_feasibility'->>'status','')<>'PASS'$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_complete_stage_v1';end if;
 f:=replace(f,$old$coalesce(i.generation_contract->'production_feasibility'->>'status','')<>'PASS'$old$,$new$(i.generation_contract->'contract_version'='5'::jsonb and public.content_pipeline_validate_visual_contract_v5(i.generation_contract,true)->>'status' is distinct from 'PASS') or (i.generation_contract->'contract_version' is distinct from '5'::jsonb and coalesce(i.generation_contract->'production_feasibility'->>'status','')<>'PASS')$new$);
 execute f;
end $migration$;

-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_reference_generation_allowed_v1';
 if f is null or md5(f)<>'ddd43694cfa4d4e426033410a230bee2' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_reference_generation_allowed_v1';end if;
 -- Close the existing legacy CASE before inserting the new inner CASE.
 if (length(f)-length(replace(f,$old$else false end
$old$,'')))/length($old$else false end
$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_reference_generation_allowed_v1';end if;
 f:=replace(f,$old$else false end
$old$,$new$else false end end
$new$);
 if (length(f)-length(replace(f,$old$select case when p_method$old$,'')))/length($old$select case when p_method$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_reference_generation_allowed_v1';end if;
 f:=replace(f,$old$select case when p_method$old$,$new$select case when p_contract->'contract_version'='5'::jsonb then
 public.content_pipeline_validate_visual_contract_v5(p_contract,true)->>'status'='PASS' and
 case p_method when 'NATIVE_FULL_GENERATION' then p_contract->'evidence_requirement'->>'level'='NONE'
 when 'REFERENCE_BASED_GENERATION' then p_contract->'evidence_requirement'->>'level'='REFERENCE'
 when 'REAL_SOURCE_AI_EDIT' then true else false end
 else case when p_method$new$);
 execute f;
end $migration$;

-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_pre_staging_gate_v1';
 if f is null or md5(f)<>'8fcfb208c627c9390dfb788a8831c9a1' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_pre_staging_gate_v1';end if;
 if (length(f)-length(replace(f,$old$ if p_spec->>'preflightOnly'='true' then$old$,'')))/length($old$ if p_spec->>'preflightOnly'='true' then$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_pre_staging_gate_v1';end if;
 f:=replace(f,$old$ if p_spec->>'preflightOnly'='true' then$old$,$new$ i.generation_contract:=public.content_pipeline_visual_policy_v1(i.generation_contract);
 if p_spec->>'preflightOnly'='true' then$new$);
 if (length(f)-length(replace(f,$old$ return jsonb_build_object('status','PASS','evaluator'$old$,'')))/length($old$ return jsonb_build_object('status','PASS','evaluator'$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_pre_staging_gate_v1';end if;
 f:=replace(f,$old$ return jsonb_build_object('status','PASS','evaluator'$old$,$new$ if i.generation_contract->'contract_version'='5'::jsonb then
 for item in select value->>'text' from jsonb_array_elements(coalesce(p_spec->'transform'->'annotations','[]'::jsonb)) where value->>'type'='label' loop
 if q->'annotationTargetChecks'->>item is distinct from 'PASS' then raise exception 'PRE_STAGING_ANNOTATION_TARGET_NOT_VERIFIED';end if;
 end loop;
 end if;
 return jsonb_build_object('status','PASS','evaluator'$new$);
 execute f;
end $migration$;

-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_approve_source_stage_v1';
 if f is null or md5(f)<>'fc2a5a577eaab934164fb6de29f7ec4d' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_approve_source_stage_v1';end if;
 if (length(f)-length(replace(f,$old$ role:=upper(coalesce(i.generation_contract->>'asset_role','BODY'));$old$,'')))/length($old$ role:=upper(coalesce(i.generation_contract->>'asset_role','BODY'));$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_approve_source_stage_v1';end if;
 f:=replace(f,$old$ role:=upper(coalesce(i.generation_contract->>'asset_role','BODY'));$old$,$new$ i.generation_contract:=public.content_pipeline_visual_policy_v1(i.generation_contract);
 role:=upper(coalesce(i.generation_contract->>'asset_role','BODY'));$new$);
 execute f;
end $migration$;

-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_dispatch_visual_generation_request_v1';
 if f is null or md5(f)<>'d99875c0a08d16ea03214287da607d56' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_dispatch_visual_generation_request_v1';end if;
 if (length(f)-length(replace(f,$old$not in ('REFERENCE_BASED_GENERATION','REAL_SOURCE_AI_EDIT')$old$,'')))/length($old$not in ('REFERENCE_BASED_GENERATION','REAL_SOURCE_AI_EDIT')$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_dispatch_visual_generation_request_v1';end if;
 f:=replace(f,$old$not in ('REFERENCE_BASED_GENERATION','REAL_SOURCE_AI_EDIT')$old$,$new$not in ('REFERENCE_BASED_GENERATION','REAL_SOURCE_AI_EDIT','NATIVE_FULL_GENERATION')$new$);
 if (length(f)-length(replace(f,$old$ if jsonb_array_length(p_spec->'references') not between 1 and 4 then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;$old$,'')))/length($old$ if jsonb_array_length(p_spec->'references') not between 1 and 4 then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_dispatch_visual_generation_request_v1';end if;
 f:=replace(f,$old$ if jsonb_array_length(p_spec->'references') not between 1 and 4 then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;$old$,$new$ if p_spec->>'productionMethod'='NATIVE_FULL_GENERATION' then
 if jsonb_array_length(p_spec->'references')<>0 or p_spec ? 'inputFile' or p_spec ? 'inputAssetUrl' then raise exception 'INVALID_NATIVE_FULL_GENERATION_INPUT';end if;
 elsif jsonb_array_length(p_spec->'references') not between 1 and 4 then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;$new$);
 execute f;
end $migration$;

-- Exact deployed partial-V5 definition guard. Abort rather than overwrite concurrent work.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_visual_contract_policy_v1';
 if f is null or md5(f)<>'98f1fc036381dea1d083f13075ea5be7' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_visual_contract_policy_v1';end if;
 if (length(f)-length(replace(f,$old$begin
  if v_version >= 5 then$old$,'')))/length($old$begin
  if v_version >= 5 then$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_visual_contract_policy_v1';end if;
 f:=replace(f,$old$begin
  if v_version >= 5 then$old$,$new$begin
  if p_contract->'contract_version'='5'::jsonb then
   return jsonb_build_object('policyVersion','VISUAL_RUNTIME_V1','evidenceLevel',public.content_pipeline_visual_policy_v1(p_contract)->>'evidence_level',
   'allowedProductionMethods',public.content_pipeline_visual_policy_v1(p_contract)->'source_priority',
   'sourceRequired',public.content_pipeline_visual_policy_v1(p_contract)->'real_source_required',
   'referenceRequired',public.content_pipeline_visual_policy_v1(p_contract)->'reference_fact_required',
   'allowFullGeneration',public.content_pipeline_visual_policy_v1(p_contract)->'full_generation_allowed',
   'allowReferenceGeneration',public.content_pipeline_visual_policy_v1(p_contract)->'reference_based_generation_allowed',
   'allowAiEdit',true,'allowEvidenceDowngrade',false,'peoplePolicy',public.content_pipeline_visual_policy_v1(p_contract)->>'people_mode',
   'onRequiredEvidenceUnavailable','FAIL_SOURCE_SELECTION_KEEP_EVIDENCE_LEVEL');
  end if;
  if v_version >= 5 then$new$);
 execute f;
end $migration$;

revoke all on function public.content_pipeline_build_image_generation_contract_v1(bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_build_image_generation_contract_v1(bigint) to service_role;

revoke all on function public.content_pipeline_build_image_generation_contract_v5(bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_build_image_generation_contract_v5(bigint) to service_role;

revoke all on function public.content_pipeline_validate_image_brief_v5(jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_validate_image_brief_v5(jsonb) to service_role;

revoke all on function public.content_pipeline_validate_image_brief_feasibility_v1(jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_validate_image_brief_feasibility_v1(jsonb) to service_role;

revoke all on function public.content_pipeline_visual_contract_policy_v1(jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_visual_contract_policy_v1(jsonb) to service_role;

revoke all on function public.content_pipeline_visual_review_requirements_v1(jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_visual_review_requirements_v1(jsonb) to service_role;


-- V5 semantic briefs omit operational asset_key; server preserves/allocates task keys.
do $migration$
declare f text;
begin
 select pg_get_functiondef(p.oid) into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='content_pipeline_sync_images_v1';
 if f is null or md5(f)<>'778a9f834c39c7e1a1d35dbdbe4d91f2' then raise exception 'PRODUCTION_FUNCTION_DRIFT: content_pipeline_sync_images_v1';end if;
 if (length(f)-length(replace(f,$old$    v_asset:=coalesce(v_item->>'asset_key',case when v_ord=0 then 'thumbnail' when v_ord=1 then 'hero' else 'body-'||lpad((v_ord-1)::text,2,'0') end);$old$,'')))/length($old$    v_asset:=coalesce(v_item->>'asset_key',case when v_ord=0 then 'thumbnail' when v_ord=1 then 'hero' else 'body-'||lpad((v_ord-1)::text,2,'0') end);$old$)<>1 then raise exception 'FUNCTION_FRAGMENT_DRIFT: content_pipeline_sync_images_v1';end if;
 f:=replace(f,$old$    v_asset:=coalesce(v_item->>'asset_key',case when v_ord=0 then 'thumbnail' when v_ord=1 then 'hero' else 'body-'||lpad((v_ord-1)::text,2,'0') end);$old$,$new$    if v_item->'contract_version'='5'::jsonb then
      if v_item->>'asset_role'='THUMBNAIL' then v_asset:='thumbnail';
      elsif v_item->>'asset_role' in('HERO','THUMBNAIL_HERO') then v_asset:='hero';
      else
       -- Preserve a compatible existing task identity; new BODY keys are allocated server-side.
       select asset_key into v_asset from public."21_content_pipeline_image"
       where pipeline_id=p_pipeline_id and image_id=v_item->>'image_id' and asset_key ~ '^body-[0-9]{2}$'
       order by pipeline_image_id limit 1;
       if v_asset is null then
        select 'body-'||lpad(n::text,2,'0') into v_asset from generate_series(1,99) n
        where not ('body-'||lpad(n::text,2,'0'))=any(v_keys)
        and not exists(select 1 from public."21_content_pipeline_image" old where old.pipeline_id=p_pipeline_id and old.asset_key='body-'||lpad(n::text,2,'0'))
        order by n limit 1;
        if v_asset is null then raise exception 'CONTENT_PIPELINE_BODY_ASSET_CAPACITY_EXCEEDED';end if;
       end if;
      end if;
    else
    v_asset:=coalesce(v_item->>'asset_key',case when v_ord=0 then 'thumbnail' when v_ord=1 then 'hero' else 'body-'||lpad((v_ord-1)::text,2,'0') end);
    end if;$new$);
 execute f;
end $migration$;
commit;
