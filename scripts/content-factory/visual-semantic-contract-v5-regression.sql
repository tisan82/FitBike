begin;
do $test$
declare b jsonb:='{"contract_version":5,"image_id":"IMG_03","asset_role":"BODY","user_question":"What can be seen below this engine?","visual_objective":"Show the engine underside and parking surface.","must_show":["motorcycle engine underside","clean parking surface"],"must_not_show":["people","fabricated oil leak"],"evidence_requirement":{"level":"NONE"},"alt_text_draft":"Motorcycle engine underside above a clean parking surface."}';
 p jsonb; c jsonb; i public."21_content_pipeline_image"%rowtype; oldc jsonb; oldh text; changed jsonb; k text; legacy jsonb;
begin
 if public.content_pipeline_validate_image_brief_feasibility_v1(b)->>'status' is distinct from 'PASS' then raise exception 'MINIMAL_V5_REJECTED';end if;
 if public.content_pipeline_validate_visual_contract_v5(b)->>'pixelsInspected' is distinct from 'false' then raise exception 'SCHEMA_CLAIMED_PIXEL_INSPECTION';end if;
 p:=public.content_pipeline_visual_policy_v1(b);
 if p->>'people_mode' is distinct from 'NONE' or p->'pixel_qa_contract'->'required_visible' is distinct from b->'must_show'
 or p->'pixel_qa_contract'->>'semantic_objective_is_gate' is distinct from 'false' or p->'annotation_contract'->>'required' is distinct from 'false' then raise exception 'POLICY_DERIVATION_FAILED';end if;
 if public.content_pipeline_reference_generation_allowed_v1(b,'NATIVE_FULL_GENERATION') is distinct from true
 or public.content_pipeline_reference_generation_allowed_v1(b,'REFERENCE_BASED_GENERATION') is distinct from false then raise exception 'NONE_METHOD_PERMISSION_FAILED';end if;
 c:=jsonb_set(b,'{evidence_requirement,level}','"REFERENCE"');
 if public.content_pipeline_reference_generation_allowed_v1(c,'REFERENCE_BASED_GENERATION') is distinct from true
 or public.content_pipeline_reference_generation_allowed_v1(c,'NATIVE_FULL_GENERATION') is distinct from false then raise exception 'REFERENCE_METHOD_PERMISSION_FAILED';end if;
 c:=jsonb_set(b,'{evidence_requirement,level}','"REQUIRED"');
 if public.content_pipeline_reference_generation_allowed_v1(c,'REAL_SOURCE_AI_EDIT') is distinct from true
 or public.content_pipeline_reference_generation_allowed_v1(c,'REFERENCE_BASED_GENERATION') is distinct from false
 or public.content_pipeline_reference_generation_allowed_v1(c,'NATIVE_FULL_GENERATION') is distinct from false
 or public.content_pipeline_visual_policy_v1(c)->>'real_source_required' is distinct from 'true' then raise exception 'REQUIRED_METHOD_PERMISSION_FAILED';end if;
 foreach k in array array['people_mode','annotation_contract','pixel_qa_contract','composition_plan','generation_allowed','production_feasibility'] loop
 if public.content_pipeline_validate_visual_contract_v5(b||jsonb_build_object(k,true))->>'status' is distinct from 'FAIL' then raise exception 'UNKNOWN_FIELD_ALLOWED: %',k;end if;
 end loop;
 if public.content_pipeline_validate_visual_contract_v5(b||'{"must_show":["same"],"must_not_show":[" SAME "]}')->>'status' is distinct from 'FAIL' then raise exception 'VISIBLE_CONTRADICTION_ALLOWED';end if;
 if public.content_pipeline_validate_visual_contract_v5(b||'{"must_show":["rider seated on motorcycle"],"must_not_show":["people"]}')->>'status' is distinct from 'FAIL' then raise exception 'PEOPLE_CONTRADICTION_ALLOWED';end if;
 c:=b||'{"must_show":["rider seated on motorcycle"],"must_not_show":[]}';
 if public.content_pipeline_visual_policy_v1(c)->>'people_mode' is distinct from 'REQUIRED' then raise exception 'EXPLICIT_PEOPLE_LOST';end if;
 c:=b||'{"must_show":["helmeted rider seated on motorcycle"],"must_not_show":["unhelmeted rider"]}';
 if public.content_pipeline_validate_visual_contract_v5(c)->>'status' is distinct from 'PASS' then raise exception 'RIDER_STATE_NEGATIVE_REJECTED';end if;
 c:=b||'{"must_show":["helmeted rider portrait"],"must_not_show":["hands"]}';
 if public.content_pipeline_validate_visual_contract_v5(c)->>'status' is distinct from 'PASS' then raise exception 'RIDER_CROP_NEGATIVE_REJECTED';end if;
 c:=b||'{"must_show":["정차한 오토바이와 운전자"],"must_not_show":[]}';
 if public.content_pipeline_visual_policy_v1(c)->>'people_mode' is distinct from 'REQUIRED' then raise exception 'KOREAN_DRIVER_PEOPLE_LOST';end if;
 c:=b||'{"must_show":["motorcycle handlebar"],"must_not_show":[]}';
 if public.content_pipeline_visual_policy_v1(c)->>'people_mode' is distinct from 'NONE' then raise exception 'HANDLEBAR_MISCLASSIFIED_AS_HAND';end if;
 if public.content_pipeline_validate_visual_contract_v5(b||'{"image_id":"IMAGE_03"}')->>'status' is distinct from 'FAIL' then raise exception 'INVALID_IMAGE_ID_ALLOWED';end if;
 if public.content_pipeline_validate_visual_contract_v5(b||jsonb_build_object('alt_text_draft',repeat('a',301)))->>'status' is distinct from 'FAIL' then raise exception 'OVERSIZED_ALT_ALLOWED';end if;
 if public.content_pipeline_validate_visual_contract_v5(b||jsonb_build_object('alt_text_draft',repeat(' ',301)||'a'))->>'status' is distinct from 'FAIL' then raise exception 'WHITESPACE_OVERSIZED_ALT_ALLOWED';end if;
 if public.content_pipeline_validate_visual_contract_v5(b||'{"must_show":null}')->>'status' is distinct from 'FAIL' then raise exception 'NULL_MUST_SHOW_ALLOWED';end if;
 if public.content_pipeline_validate_visual_contract_v5(b||'{"evidence_requirement":{"level":"NONE","fact_ids":["CF0"]}}')->>'status' is distinct from 'FAIL' then raise exception 'INVALID_FACT_ID_ALLOWED';end if;
 if public.content_pipeline_validate_visual_contract_v5(b||'{"evidence_requirement":{"level":"REFERENCE","fact_ids":["CF1","CF1"]}}')->>'status' is distinct from 'FAIL' then raise exception 'DUPLICATE_FACT_ID_ALLOWED';end if;
 c:=b||'{"evidence_requirement":{"level":"REFERENCE","fact_ids":["CF1"],"evidence_ref":[{"source_ref":"https://example.org/manual","model_scope":"one motorcycle model","supports":"the visible connector structure"}]}}';
 if public.content_pipeline_validate_visual_contract_v5(c)->>'status' is distinct from 'PASS' then raise exception 'OPTIONAL_EVIDENCE_REF_REJECTED';end if;
 if public.content_pipeline_validate_visual_contract_v5(jsonb_set(c,'{evidence_requirement,evidence_ref,0,source_ref}','"http://example.org"'))->>'status' is distinct from 'FAIL' then raise exception 'NONHTTPS_EVIDENCE_ALLOWED';end if;
 if public.content_pipeline_validate_image_brief_feasibility_v1(b||'{"contract_version":6}')->>'status' is distinct from 'FAIL' then raise exception 'UNKNOWN_VERSION_ALLOWED';end if;
 legacy:='{"contract_version":4,"generation_allowed":true,"real_source_required":false,"reference_based_generation_allowed":true,"ai_edit_allowed":true}';
 if public.content_pipeline_visual_policy_v1(legacy) is distinct from legacy
 or public.content_pipeline_reference_generation_allowed_v1(legacy,'REFERENCE_BASED_GENERATION') is distinct from true
 or public.content_pipeline_reference_generation_allowed_v1(legacy,'NATIVE_FULL_GENERATION') is distinct from false then raise exception 'LEGACY_POLICY_CHANGED';end if;
 select * into i from public."21_content_pipeline_image" where image_id ~ '^IMG_[0-9]{2,}$'
 and status in ('PENDING','RETRY') and generation_contract->>'contract_version'='4' order by pipeline_image_id desc limit 1;
 if not found then raise exception 'V4_FIXTURE_REQUIRED';end if;
 oldc:=i.generation_contract;oldh:=i.generation_contract_hash;
 c:=public.content_pipeline_visual_policy_v1(oldc);
 if c is distinct from oldc then raise exception 'EXISTING_V4_POLICY_MUTATED';end if;
 b:=jsonb_set(b,'{image_id}',to_jsonb(i.image_id));
 update public."21_content_pipeline_image" set image_brief=b where pipeline_image_id=i.pipeline_image_id;
 c:=public.content_pipeline_build_image_generation_contract_v1(i.pipeline_image_id);
 if c is distinct from b then raise exception 'V5_AUTHORITATIVE_SEMANTICS_REWRITTEN';end if;
 if c ? 'production_feasibility' or c ? 'pixel_qa_contract' or c ? 'people_mode' then raise exception 'V5_HASH_CONTAINS_OPERATIONAL_POLICY';end if;
 if public.content_pipeline_validate_visual_contract_v5(c,true)->>'status' is distinct from 'PASS'
 or public.content_pipeline_validate_visual_contract_v5(c||jsonb_build_object('pipeline_image_id',i.pipeline_image_id),false)->>'status' is distinct from 'FAIL' then raise exception 'METADATA_SCOPE_INVALID';end if;
 perform public.content_pipeline_visual_policy_v1(c);
 if not exists(select 1 from public."21_content_pipeline_image" where pipeline_image_id=i.pipeline_image_id and generation_contract=oldc and generation_contract_hash=oldh) then raise exception 'POLICY_READ_CHANGED_EXISTING_HASH';end if;
 if has_function_privilege('anon','public.content_pipeline_visual_policy_v1(jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.content_pipeline_visual_policy_v1(jsonb)','EXECUTE')
 or has_function_privilege('anon','public.content_pipeline_validate_visual_contract_v5(jsonb,boolean)','EXECUTE') then raise exception 'V5_HELPER_PRIVILEGE_LEAK';end if;
end $test$;

-- Stored bytes are real; semantic attestations below are rollback-only protocol fixtures, not production QA.
do $flow$
declare
 i public."21_content_pipeline_image"%rowtype;j public."27_content_pipeline_source_stage_job"%rowtype;p public."18_content_pipeline"%rowtype;
 b jsonb; artifact jsonb;c jsonb;h text;old_contract jsonb;old_hash text;
 w text:='v5-protocol-'||extensions.gen_random_uuid();pr uuid:=extensions.gen_random_uuid();rr uuid:=extensions.gen_random_uuid();job uuid:=extensions.gen_random_uuid();finaljob uuid:=extensions.gen_random_uuid();
 x jsonb;y jsonb;q jsonb;checks jsonb;token uuid;spec jsonb;
begin
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id
 join public."27_content_pipeline_source_stage_job" j0 on j0.pipeline_image_id=i0.pipeline_image_id
 where i0.asset_key ~ '^body-' and i0.status in('PENDING','RETRY') and i0.image_id ~ '^IMG_[0-9]{2,}$'
 and p0.ownership_state='CLAIMED' and p0.stage in('DRAFTED','VISUAL')
 and jsonb_typeof(p0.writer_artifact->'image_briefs')='array'
 and not exists(select 1 from public."21_content_pipeline_image" busy where busy.pipeline_id=i0.pipeline_id and busy.status='PROCESSING')
 and public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,j0.job_id) is not null
 and (j0.spec->>'preflightOnly'='true' or j0.result->>'preflightOnly'='true')
 order by j0.created_at desc limit 1;
 if not found then raise exception 'STORED_PREFLIGHT_WITH_UNLOCKED_PIPELINE_REQUIRED';end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 select j0.* into j from public."27_content_pipeline_source_stage_job" j0
 where j0.pipeline_image_id=i.pipeline_image_id and public.content_pipeline_review_candidate_v1(i.pipeline_image_id,j0.job_id) is not null
 and (j0.spec->>'preflightOnly'='true' or j0.result->>'preflightOnly'='true') order by created_at desc limit 1;
 old_contract:=i.generation_contract;old_hash:=i.generation_contract_hash;
 b:=jsonb_build_object('contract_version',5,'image_id',i.image_id,'asset_role','BODY',
 'user_question','Where are these visible objects?','visual_objective','Show two visually identifiable objects.',
 'must_show',jsonb_build_array('motorcycle structure','parking surface'),'must_not_show','[]'::jsonb,
 'evidence_requirement',jsonb_build_object('level','NONE'),'alt_text_draft','Motorcycle structure above the parking surface.');
 select p.writer_artifact||jsonb_build_object('image_briefs',jsonb_agg(case when value->>'image_id'=i.image_id then b else value end order by ord))
 into artifact from jsonb_array_elements(p.writer_artifact->'image_briefs') with ordinality a(value,ord);
 if not exists(select 1 from jsonb_array_elements(artifact->'image_briefs') a where a=b) then raise exception 'WRITER_FIXTURE_IMAGE_NOT_FOUND';end if;
 -- The actual WRITING completion gate, including sync, must accept minimal V5 while preserving other briefs.
 update public."18_content_pipeline" set stage='WRITING' where pipeline_id=i.pipeline_id;
 x:=public.content_pipeline_complete_stage_v1(i.pipeline_id,0,'WRITING','DRAFTED',artifact);
 select generation_contract,generation_contract_hash into c,h from public."21_content_pipeline_image" where pipeline_image_id=i.pipeline_image_id;
 if c is distinct from b or h is distinct from encode(extensions.digest(convert_to(b::text,'UTF8'),'sha256'),'hex') then raise exception 'STAGE2_V5_HASH_CHANGED_SEMANTICS';end if;
 if not exists(select 1 from public."21_content_pipeline_image" where pipeline_image_id=i.pipeline_image_id and asset_key=i.asset_key and image_id=i.image_id) then raise exception 'STAGE2_V5_TASK_IDENTITY_CHANGED';end if;
 x:=public.content_pipeline_claim_visual_stage_v1(w,pr,'PRODUCER',i.pipeline_image_id);
 if x->>'activeClaim' is distinct from 'true' then raise exception 'V5_PRODUCER_CLAIM_FAILED: %',x;end if;
 if x->'claim'->'generationContract' is distinct from b or x->'claim'->>'generationContractHash' is distinct from h
 or x->'claim'->'nativeGenerationContext'->'qaCoreRequired' is distinct from b->'must_show'
 or x->'claim'->'nativeGenerationContext'->>'peopleMode' is distinct from 'NONE' then raise exception 'V5_CLAIM_POLICY_OR_HASH_INVALID: %',x;end if;
 token:=(x->'claim'->>'claimToken')::uuid;
 -- Validate bad full-generation inputs without a network dispatch.
 begin
 perform public.content_pipeline_dispatch_visual_generation_request_v1(w,pr,extensions.gen_random_uuid(),
 jsonb_build_object('productionMethod','NATIVE_FULL_GENERATION','prompt','A realistic scene for protocol validation only.',
 'references','[]'::jsonb,'transform','{}'::jsonb,'preflightOnly',true,'inputAssetUrl','https://example.org/fixture'));
 raise exception 'FULL_GENERATION_INPUT_SOURCE_ALLOWED';
 exception when others then if sqlerrm<>'INVALID_NATIVE_FULL_GENERATION_INPUT' then raise;end if;end;
 -- Native or raster borrowed pixels must not carry an ephemeral file input into a resume fixture.
 spec:=(j.spec-'chatFile'-'inputFile'-'generatedAssetUrl'-'expectedGeneratedSha'-'inputAssetUrl'-'nativeAttemptId'-'nativeAttemptBinding')||jsonb_build_object('productionMethod','NATIVE_FULL_GENERATION','prompt','A realistic current-task scene for rollback protocol validation only.','references','[]'::jsonb,'preflightOnly',true,
 'visualMcpOperation',jsonb_build_object('workerKey',w,'requestId',pr,'operationId',extensions.gen_random_uuid()));
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result)
 values(job,i.pipeline_image_id,token,h,spec,'STAGED',extensions.digest('v5-flow','sha256'),j.result||'{"preflightOnly":true}'::jsonb);
 x:=public.content_pipeline_handoff_visual_review_v1(w,pr,job,j.result->>'sha256');
 if x->>'visualPhase' is distinct from 'QA_PENDING' or x->>'activeClaim' is distinct from 'false' then raise exception 'V5_HANDOFF_FAILED';end if;
 y:=public.content_pipeline_claim_visual_stage_v1(w,rr,'REVIEWER',i.pipeline_image_id);
 if y->>'activeClaim' is distinct from 'true' then raise exception 'V5_REVIEW_CLAIM_FAILED';end if;
 token:=(y->'claim'->>'claimToken')::uuid;
 select jsonb_object_agg(value,'PASS') into checks from jsonb_array_elements_text(b->'must_show');
 q:=jsonb_build_object('pipelineImageId',i.pipeline_image_id,'contractHash',h,'sourceJobId',job,
 'sourceSha256',j.result->>'preStagingSourceSha256','pixelsInspected',true,'status','PASS',
 'evidence','Rollback-only protocol fixture, never persisted as production pixel QA.',
 'mustShowChecks',checks,'mustNotShowChecks','{}'::jsonb,'inspectionTargetVerified',true);
 x:=public.content_pipeline_register_pre_staging_qa_v1(w,rr,job,j.result->>'sha256',q);
 if x->>'status' is distinct from 'PRE_STAGING_QA_RECORDED' then raise exception 'V5_PREQA_FAILED';end if;
 begin perform public.content_pipeline_pre_staging_gate_v1(i.pipeline_image_id,h,
 spec||jsonb_build_object('preflightOnly',false,'preStagingQa',q-'mustShowChecks'),j.result->>'preStagingSourceSha256');
 raise exception 'V5_MUST_SHOW_NOT_GATED';exception when others then if sqlerrm<>'PRE_STAGING_MUST_SHOW_NOT_VERIFIED' then raise;end if;end;
 -- Optional labels are based on the selected spec, never synthesized in the Writer contract.
 begin perform public.content_pipeline_pre_staging_gate_v1(i.pipeline_image_id,h,
 spec||jsonb_build_object('preflightOnly',false,'preStagingQa',q,'transform',jsonb_build_object('annotations',jsonb_build_array(jsonb_build_object('type','label','text','engine')))),
 j.result->>'preStagingSourceSha256');raise exception 'V5_SELECTED_LABEL_NOT_GATED';
 exception when others then if sqlerrm<>'PRE_STAGING_ANNOTATION_TARGET_NOT_VERIFIED' then raise;end if;end;
 q:=q||jsonb_build_object('annotationTargetChecks',jsonb_build_object('engine','PASS'));
 x:=public.content_pipeline_pre_staging_gate_v1(i.pipeline_image_id,h,
 spec||jsonb_build_object('preflightOnly',false,'preStagingQa',q,'transform',jsonb_build_object('annotations',jsonb_build_array(jsonb_build_object('type','label','text','engine')))),
 j.result->>'preStagingSourceSha256');
 if x->>'status' is distinct from 'PASS' then raise exception 'V5_VALID_SELECTED_LABEL_REJECTED';end if;
 x:=public.content_pipeline_register_pre_staging_qa_v1(w,rr,job,j.result->>'sha256',q);
 perform public.content_pipeline_visual_role_guard_v1(w,rr,'DISPATCH',spec||jsonb_build_object('preflightOnly',false,'resumeJobId',job,'preStagingQa',q));
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result)
 values(finaljob,i.pipeline_image_id,token,h,spec||jsonb_build_object('preflightOnly',false,'preStagingQa',q),
 'STAGED',extensions.digest('v5-final','sha256'),j.result||'{"preflightOnly":false}'::jsonb);
 x:=public.content_pipeline_approve_source_stage_v1(finaljob,token,j.result->>'sha256',
 jsonb_build_object('contractHash',h,'imageQa','PASS','mobileQa','PASS','imageSeoQa','PASS'));
 if x->>'status' is distinct from 'READY_FOR_UPLOAD'
 or public.content_pipeline_visual_claim_request_status_v1(w,rr)->>'activeClaim' is distinct from 'false' then raise exception 'V5_APPROVAL_OR_RELEASE_FAILED';end if;
 if not exists(select 1 from public."21_content_pipeline_image" where pipeline_image_id=i.pipeline_image_id and generation_contract=b and generation_contract_hash=h) then raise exception 'V5_APPROVAL_REWROTE_HASH';end if;
end $flow$;
rollback;
