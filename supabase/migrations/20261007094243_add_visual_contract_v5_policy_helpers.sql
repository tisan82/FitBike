create or replace function public.content_pipeline_visual_contract_policy_v1(p_contract jsonb)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_version int := coalesce((p_contract->>'contract_version')::int, 4);
  v_level text;
  v_methods jsonb;
  v_people text := 'OPTIONAL';
  v_ms jsonb := coalesce(p_contract->'must_show','[]'::jsonb);
  v_mns jsonb := coalesce(p_contract->'must_not_show','[]'::jsonb);
begin
  if v_version >= 5 then
    v_level := upper(coalesce(p_contract->'evidence_requirement'->>'level','NONE'));
  else
    v_level := case
      when coalesce(p_contract->>'production_source_required','false')='true'
        or coalesce(p_contract->>'real_source_required','false')='true' then 'REQUIRED'
      when coalesce(p_contract->>'reference_fact_required','false')='true'
        or coalesce(p_contract->>'reference_based_generation_allowed','false')='true' then 'REFERENCE'
      else 'NONE'
    end;
  end if;

  if v_level not in ('NONE','REFERENCE','REQUIRED') then
    raise exception using errcode='22023', message='CONTENT_PIPELINE_INVALID_EVIDENCE_LEVEL';
  end if;

  if lower(v_ms::text) ~ '(사람|손|팔|운전자|정비사|rider|hand|person)' then
    v_people := 'REQUIRED';
  elsif lower(v_mns::text) ~ '(사람|손|팔|운전자|정비사|rider|hand|person)' then
    v_people := 'NONE';
  end if;

  v_methods := case v_level
    when 'REQUIRED' then '["REAL_SOURCE_DIRECT","REAL_SOURCE_CROP_OR_MARK","REAL_SOURCE_AI_EDIT"]'::jsonb
    when 'REFERENCE' then '["REAL_SOURCE_DIRECT","REAL_SOURCE_CROP_OR_MARK","REAL_SOURCE_AI_EDIT","REFERENCE_BASED_GENERATION"]'::jsonb
    else '["REAL_SOURCE_DIRECT","REAL_SOURCE_CROP_OR_MARK","REAL_SOURCE_AI_EDIT","REFERENCE_BASED_GENERATION","FULL_AI_GENERATION"]'::jsonb
  end;

  return jsonb_build_object(
    'policyVersion','VISUAL_RUNTIME_V1',
    'evidenceLevel',v_level,
    'allowedProductionMethods',v_methods,
    'sourceRequired',v_level='REQUIRED',
    'referenceRequired',v_level in ('REFERENCE','REQUIRED'),
    'allowFullGeneration',v_level='NONE',
    'allowReferenceGeneration',v_level in ('NONE','REFERENCE'),
    'allowAiEdit',true,
    'allowEvidenceDowngrade',false,
    'peoplePolicy',v_people,
    'onRequiredEvidenceUnavailable','FAIL_SOURCE_SELECTION_KEEP_EVIDENCE_LEVEL'
  );
end
$function$;

create or replace function public.content_pipeline_visual_review_requirements_v1(p_contract jsonb)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_ms jsonb := coalesce(p_contract->'must_show','[]'::jsonb);
  v_mns jsonb := coalesce(p_contract->'must_not_show','[]'::jsonb);
  v_policy jsonb;
  v_role text := coalesce(p_contract->>'asset_role','BODY');
begin
  v_policy := public.content_pipeline_visual_contract_policy_v1(p_contract);
  return jsonb_build_object(
    'reviewPolicyVersion','VISUAL_REVIEW_V1',
    'requiredVisible',v_ms,
    'prohibitedVisible',v_mns,
    'allMustShowRequired',true,
    'evidenceLevel',v_policy->>'evidenceLevel',
    'peoplePolicy',v_policy->>'peoplePolicy',
    'semanticObjectiveIsGate',false,
    'mobileRule','At 390px every must_show item must remain identifiable.',
    'roleCropRule','Every must_show item must remain identifiable in the actual '||v_role||' crop.',
    'technicalChecks',jsonb_build_array('DECODE','DIMENSIONS','SHA256','DUPLICATE')
  );
end
$function$;
