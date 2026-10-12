-- Read-only policy acceptance: historical Contract values remain untouched.
do $check$
declare c jsonb;l text;m text;v jsonb;
begin
 foreach l in array array['NONE','REFERENCE','REQUIRED'] loop
  c:=jsonb_build_object('contract_version',5,'image_id','IMG_01','asset_role','BODY','user_question','Show a parked motorcycle','visual_objective','Explain inspection','must_show',jsonb_build_array('parked motorcycle'),'must_not_show','[]'::jsonb,'alt_text_draft','Motorcycle inspection','evidence_requirement',jsonb_build_object('level',l));
  v:=public.content_pipeline_visual_policy_v1(c);
  if v->>'evidence_level'<>'NONE' or v->>'real_source_required'<>'false' or v->>'reference_fact_required'<>'false' or v->>'pdf_visual_allowed'<>'false' then raise exception 'PHOTO_POLICY_LEVEL_GATE_REMAINS';end if;
  foreach m in array array['NATIVE_FULL_GENERATION','REFERENCE_BASED_GENERATION','REAL_SOURCE_AI_EDIT'] loop
   if not public.content_pipeline_reference_generation_allowed_v1(c,m) then raise exception 'PHOTO_POLICY_METHOD_BLOCKED';end if;
  end loop;
  if c->'evidence_requirement'->>'level'<>l then raise exception 'PHOTO_POLICY_CONTRACT_CHANGED';end if;
 end loop;
 if public.content_pipeline_reference_generation_allowed_v1(c,'EXTERNAL_API') then raise exception 'PHOTO_POLICY_EXTERNAL_METHOD_ALLOWED';end if;
 if public.content_pipeline_visual_contract_policy_v1('{"contract_version":4,"real_source_required":true,"generation_allowed":false}') ->>'evidenceLevel'<>'NONE' then raise exception 'PHOTO_POLICY_LEGACY_GATE_REMAINS';end if;
end $check$;
