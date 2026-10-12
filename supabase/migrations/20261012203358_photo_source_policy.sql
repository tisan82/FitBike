-- Photo-first autonomous production. No asset, Contract/hash or history rewrites.
CREATE OR REPLACE FUNCTION public.content_pipeline_complete_authoring_v1(p_pipeline_id bigint, p_pipeline_run_id bigint, p_package jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare artifact jsonb;writer jsonb;briefs jsonb;
begin
 if jsonb_typeof(p_package) is distinct from 'object' or p_package->'version' is distinct from '1'::jsonb
  or exists(select 1 from jsonb_object_keys(p_package) k where k not in ('version','execution','planning','research','writer'))
  or jsonb_typeof(p_package->'writer') is distinct from 'object' or p_package->'writer' ? 'authoringContext' then raise exception 'AUTHORING_PACKAGE_INVALID';end if;
 writer:=p_package->'writer';
 if jsonb_typeof(writer->'image_briefs')='array' then
  select coalesce(jsonb_agg(case when b->'contract_version'='5'::jsonb and jsonb_typeof(b->'evidence_requirement')='object' then jsonb_set(b,'{evidence_requirement,level}','"NONE"'::jsonb) else b end order by ord),'[]'::jsonb)
  into briefs from jsonb_array_elements(writer->'image_briefs') with ordinality as x(b,ord);
  writer:=jsonb_set(writer,'{image_briefs}',briefs);
 end if;
 artifact:=writer||jsonb_build_object('authoringContext',jsonb_build_object('version',1,'execution',p_package->'execution','planning',p_package->'planning','research',p_package->'research'));
 return public.content_pipeline_complete_stage_v1(p_pipeline_id,p_pipeline_run_id,'WRITING','DRAFTED',artifact);
end $function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_reference_generation_allowed_v1(p_contract jsonb,p_method text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $function$
 select coalesce(jsonb_typeof(p_contract)='object' and
 (p_contract->'contract_version' is distinct from '5'::jsonb or public.content_pipeline_validate_visual_contract_v5(p_contract,true)->>'status'='PASS')
 and p_method in ('NATIVE_FULL_GENERATION','REFERENCE_BASED_GENERATION','REAL_SOURCE_AI_EDIT'),false)
$function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_visual_contract_policy_v1(p_contract jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO '' AS $function$
declare v jsonb;begin
 if p_contract->'contract_version'='5'::jsonb then v:=public.content_pipeline_visual_policy_v1(p_contract);else v:=p_contract;end if;
 return jsonb_build_object('policyVersion','VISUAL_PHOTO_V3','evidenceLevel','NONE',
 'allowedProductionMethods','["NATIVE_FULL_GENERATION","REFERENCE_BASED_GENERATION","REAL_SOURCE_DIRECT","REAL_SOURCE_CROP_OR_MARK","REAL_SOURCE_AI_EDIT"]'::jsonb,
 'sourceRequired',false,'referenceRequired',false,'allowFullGeneration',true,'allowReferenceGeneration',true,'allowAiEdit',true,
 'allowEvidenceDowngrade',true,'peoplePolicy',coalesce(v->>'people_mode','OPTIONAL'),'partialHumanAllowed',coalesce((v->>'partial_human_allowed')::boolean,true),
 'sourceOrderEnforced',false,'pdfVisualAllowed',false,'evidenceIsGuidanceOnly',true,'onRequiredEvidenceUnavailable','SELECT_OTHER_PHOTO_OR_NATIVE_METHOD');
end $function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_visual_policy_v1(p_contract jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare e text; pm text; v jsonb; ms_text text; mns_text text;
begin
 if p_contract->'contract_version' is distinct from '5'::jsonb then
 return jsonb_set(p_contract,'{evidence_requirement,level}','"NONE"'::jsonb)||jsonb_build_object('server_policy_version','VISUAL_PHOTO_V3','evidence_level','NONE','generation_allowed',true,'full_generation_allowed',true,'reference_based_generation_allowed',true,'real_source_required',false,'production_source_required',false,'reference_fact_required',false,'structure_preserving_edit_required',false,'ai_edit_allowed',true,'source_strategy','GENERATION_OR_REAL_SOURCE','source_priority','["NATIVE_FULL_GENERATION","REFERENCE_BASED_GENERATION","REAL_SOURCE_DIRECT","REAL_SOURCE_CROP_OR_MARK","REAL_SOURCE_AI_EDIT"]'::jsonb,'source_order_enforced',false,'pdf_visual_allowed',false,'evidence_is_guidance_only',true);
 end if;
 v:=public.content_pipeline_validate_visual_contract_v5(p_contract,true);
 if v->>'status' is distinct from 'PASS' then raise exception using message='V5_CONTRACT_INVALID',detail=v::text;end if;
 e:='NONE';
 ms_text:=lower(coalesce((p_contract->'must_show')::text,''));
 mns_text:=lower(coalesce((p_contract->'must_not_show')::text,''));
 pm:=case
   when ms_text ~ '(사람|라이더|정비사|운전자|배달원|승객|\\m(person|people|rider|mechanic|driver|motorcyclist|passenger)\\M)' then 'REQUIRED'
   when mns_text ~ '("사람"|"사람 없음"|"person"|"people"|"no people"|"no person")' then 'NONE'
   else 'OPTIONAL'
 end;
 return jsonb_set(p_contract,'{evidence_requirement,level}','"NONE"'::jsonb)||jsonb_build_object(
 'server_policy_version','VISUAL_PHOTO_V3','evidence_level',e,
 'people_mode',pm,'partial_human_allowed',pm<>'NONE',
 'mobile_requirement','At 390px, every must_show item remains visually identifiable.',
 'generation_allowed',true,'full_generation_allowed',true,
 'reference_based_generation_allowed',true,'real_source_required',false,
 'production_source_required',false,'reference_fact_required',false,
 'ai_edit_allowed',true,'structure_preserving_edit_required',false,
 'source_strategy','GENERATION_OR_REAL_SOURCE',
 'source_priority','["NATIVE_FULL_GENERATION","REFERENCE_BASED_GENERATION","REAL_SOURCE_DIRECT","REAL_SOURCE_CROP_OR_MARK","REAL_SOURCE_AI_EDIT"]'::jsonb,
 'source_order_enforced',false,'pdf_visual_allowed',false,'evidence_is_guidance_only',true,
 'annotation_contract',jsonb_build_object('required',false,'target_labels','[]'::jsonb),
 'pixel_qa_contract',jsonb_build_object('required_visible',p_contract->'must_show','prohibited_visible',p_contract->'must_not_show','people_mode',pm,'partial_human_allowed',pm<>'NONE','semantic_objective_is_gate',false,'annotation_contract',jsonb_build_object('required',false,'target_labels','[]'::jsonb)),
 'objective_is_gate',false,'user_question_supported',p_contract->>'user_question','fact_dependencies',coalesce(p_contract->'evidence_requirement'->'fact_ids','[]'::jsonb));
end $function$;


