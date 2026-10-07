begin;
do $test$
declare i public."21_content_pipeline_image"%rowtype;w text:='audit-regression-'||extensions.gen_random_uuid();r uuid:=extensions.gen_random_uuid();a uuid:=extensions.gen_random_uuid();c jsonb;q jsonb;z jsonb;x jsonb;
begin
 select * into i from public."21_content_pipeline_image" where generation_contract_hash is not null and not(status='PROCESSING' and claim_expires_at>=now()) order by pipeline_image_id limit 1;
 if not found then raise exception 'AUDIT_FIXTURE_REQUIRED';end if;
 -- Fixture stays in this rollback transaction; no generation/dispatch/Storage mutation.
 update public."21_content_pipeline_image" set status='PROCESSING',handoff_phase='PRODUCING',claimed_by=w,claim_token=a,claim_expires_at=now()+interval '1 hour' where pipeline_image_id=i.pipeline_image_id;
 insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,pipeline_image_id,response) values(w,r,i.pipeline_image_id,jsonb_build_object('pipelineImageId',i.pipeline_image_id,'generationContractHash',i.generation_contract_hash,'claimToken',a,'executionRole','PRODUCER'));
 q:=jsonb_build_object('contractHash',i.generation_contract_hash,'nativeCall',jsonb_build_object('prompt','A realistic current motorcycle cockpit photograph.'));
 c:=public.content_pipeline_record_native_attempt_v1(w,r,a,'REQUEST',q);
 if c->>'recorded'<>'true' then raise exception 'REQUEST_NOT_SAVED';end if;
 c:=public.content_pipeline_record_native_attempt_v1(w,r,a,'REQUEST',q);if c->>'replayed'<>'true' then raise exception 'REPLAY_FAILED';end if;
 begin perform public.content_pipeline_record_native_attempt_v1(w,r,a,'REQUEST',q||'{"productionMethod":"changed"}');raise exception 'MUTATION_ALLOWED';exception when others then if sqlerrm<>'NATIVE_ATTEMPT_EVENT_IMMUTABLE' then raise;end if;end;
 begin perform public.content_pipeline_record_native_attempt_v1('other',r,a,'REQUEST',q);raise exception 'FOREIGN_ALLOWED';exception when others then if sqlerrm<>'NATIVE_ATTEMPT_RECEIPT_REQUIRED' then raise;end if;end;
 begin
  update public."21_content_pipeline_image" set generation_contract_hash=repeat('0',64) where pipeline_image_id=i.pipeline_image_id;
  perform public.content_pipeline_record_native_attempt_v1(w,r,extensions.gen_random_uuid(),'REQUEST',q);raise exception 'STALE_CONTRACT_ALLOWED';
 exception when others then if sqlerrm<>'NATIVE_ATTEMPT_CURRENT_CONTRACT_MISMATCH' then raise;end if;end;
 begin perform public.content_pipeline_record_native_attempt_v1(w,r,a,'RESULT',jsonb_build_object('actualNativeCall',q->'nativeCall','outputs',jsonb_build_array('{}'::jsonb),'inspectedOutput','{}'::jsonb,'pixelsInspected',true,'pixelQa','PASS','pixelEvidence','A deliberately invalid empty identity fixture.'));raise exception 'EMPTY_IDENTITY_ALLOWED';exception when others then if sqlerrm<>'INVALID_NATIVE_OUTPUT_IDENTITY' then raise;end if;end;
 z:=jsonb_build_object('actualNativeCall',jsonb_build_object('prompt','Different bicycle scene.'),'outputs',jsonb_build_array(jsonb_build_object('fileId','file_test')),'pixelQa','PASS','pixelsInspected',true,'inspectedOutput',jsonb_build_object('fileId','file_test'),'pixelEvidence','Inspected actual original current result.');
 begin perform public.content_pipeline_record_native_attempt_v1(w,r,a,'RESULT',z);raise exception 'MISMATCH_PASS_ALLOWED';exception when others then if sqlerrm<>'NATIVE_PIXEL_PASS_EVIDENCE_REQUIRED' then raise;end if;end;
 update public."21_content_pipeline_image" set status='RETRY',claim_expires_at=null where pipeline_image_id=i.pipeline_image_id;
 z:=z||'{"pixelQa":"FAIL"}';perform public.content_pipeline_record_native_attempt_v1(w,r,a,'RESULT',z);
 x:=public.content_pipeline_native_attempt_audit_v1(w,i.pipeline_image_id,r);
 if jsonb_array_length(x->'events')<>2 or x->>'serverObservedNativeCall'<>'false' or x->'events'->1->>'requestMatchesActualCall'<>'false' then raise exception 'AUDIT_READ_FAILED: %',x;end if;
 if public.content_pipeline_native_attempt_audit_v1('other',i.pipeline_image_id,r)->>'coverage'<>'MISSING' then raise exception 'FOREIGN_READ_ALLOWED';end if;
 begin perform public.content_pipeline_record_native_attempt_v1(w,r,extensions.gen_random_uuid(),'REQUEST',q);raise exception 'CLOSED_REQUEST_ALLOWED';exception when others then if sqlerrm<>'ACTIVE_VISUAL_CLAIM_REQUIRED' then raise;end if;end;
 if has_function_privilege('authenticated','public.content_pipeline_record_native_attempt_v1(text,uuid,uuid,text,jsonb)','EXECUTE') or has_table_privilege('service_role','public."30_content_pipeline_native_attempt_event"','UPDATE') then raise exception 'AUDIT_GRANT_LEAK';end if;
end $test$;
do $raw$
declare v jsonb; i public."21_content_pipeline_image"%rowtype; w text:='raw-audit-test-'||extensions.gen_random_uuid(); r uuid:=extensions.gen_random_uuid(); a uuid:=extensions.gen_random_uuid(); c jsonb; q jsonb; output jsonb:='{"fileId":"file_test_raw"}';
begin
 v:=public.content_pipeline_validate_native_call_v2('{"toolName":"image_gen.text2im","schemaVersion":"RAW_ARGUMENTS_V1","arguments":{"prompt":"Actual current motorcycle instrument photograph.","size":"1536x1024","n":1,"referenced_image_ids":["file_test_reference"]}}');
 if v->>'valid'<>'true' or v->>'runtimeSchemaValidated'<>'false' then raise exception 'RAW_VALIDATION_FAILED';end if;
 v:=public.content_pipeline_validate_native_call_v2('{"prompt":"Actual current motorcycle instrument photograph.","size":"1536x1024"}');
 if v->>'field'<>'nativeCall.size' or v->>'valid'<>'false' then raise exception 'FIELD_DIAGNOSTIC_FAILED';end if;
 v:=public.content_pipeline_validate_native_call_v2('{"toolName":"image_gen.text2im","schemaVersion":"RAW_ARGUMENTS_V1","arguments":{"prompt":"Actual current motorcycle instrument photograph.","nested":{"access_token":"secret"}}}');
 if v->>'valid'<>'false' then raise exception 'NESTED_SECRET_ALLOWED';end if;
 select * into i from public."21_content_pipeline_image" where generation_contract_hash is not null and not(status='PROCESSING' and claim_expires_at>=now()) order by pipeline_image_id limit 1;
 update public."21_content_pipeline_image" set status='PROCESSING',handoff_phase='PRODUCING',claimed_by=w,claim_token=a,claim_expires_at=now()+interval '1 hour' where pipeline_image_id=i.pipeline_image_id;
 insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,pipeline_image_id,response) values(w,r,i.pipeline_image_id,jsonb_build_object('pipelineImageId',i.pipeline_image_id,'generationContractHash',i.generation_contract_hash,'claimToken',a,'executionRole','PRODUCER'));
 q:=jsonb_build_object('contractHash',i.generation_contract_hash,'nativeCall','{"toolName":"image_gen.text2im","schemaVersion":"RAW_ARGUMENTS_V1","arguments":{"prompt":"Actual current motorcycle instrument photograph.","size":"1536x1024","n":1}}'::jsonb);
 c:=public.content_pipeline_record_native_attempt_v1(w,r,a,'REQUEST',q);
 c:=public.content_pipeline_record_native_attempt_v1(w,r,a,'RESULT',jsonb_build_object('actualNativeCall',q->'nativeCall','outputs',jsonb_build_array(output),'inspectedOutput',output,'pixelsInspected',true,'pixelQa','PASS','pixelEvidence','Actual test fixture pixels inspected; no actual image generated.'));
 if c->>'recorded'<>'true' then raise exception 'RAW_RESULT_FAILED';end if;
 if has_function_privilege('authenticated','public.content_pipeline_validate_native_call_v2(jsonb)','EXECUTE') then raise exception 'VALIDATOR_GRANT_LEAK';end if;
end $raw$;

do $nullable$
declare v jsonb; i public."21_content_pipeline_image"%rowtype; w text:='null-audit-test-'||extensions.gen_random_uuid(); r uuid:=extensions.gen_random_uuid(); a uuid:=extensions.gen_random_uuid(); q jsonb; z jsonb; audit jsonb; call jsonb:='{"toolName":"image_gen.text2im","schemaVersion":"RAW_ARGUMENTS_V1","arguments":{"prompt":null,"size":"1536x1024","n":1,"transparent_background":false,"is_style_transfer":false,"referenced_image_ids":null}}';
begin
 v:=public.content_pipeline_validate_native_call_v2(call);
 if v->>'valid'<>'true' or v->>'instructionVisibility'<>'UNOBSERVED' or v->>'runtimeSchemaValidated'<>'false' then raise exception 'NULL_PROMPT_CAPTURE_FAILED';end if;
 v:=public.content_pipeline_validate_native_call_v2(jsonb_set(call,'{arguments}','{}'));
 if v->>'valid'<>'true' or v->>'instructionVisibility'<>'UNOBSERVED' then raise exception 'OMITTED_PROMPT_CAPTURE_FAILED';end if;
 v:=public.content_pipeline_validate_native_call_v2(jsonb_set(call,'{arguments,prompt}','123'));
 if v->>'valid'<>'false' then raise exception 'NUMERIC_PROMPT_ALLOWED';end if;
 v:=public.content_pipeline_validate_native_call_v2('{"prompt":null}');
 if v->>'valid'<>'false' then raise exception 'LEGACY_NULL_ALLOWED';end if;
 v:=public.content_pipeline_validate_native_call_v2(call||'{"sceneInstruction":{"text":null,"location":"UNOBSERVED"}}');
 if v->>'valid'<>'true' or v->>'instructionVisibility'<>'UNOBSERVED' then raise exception 'EXPLICIT_UNOBSERVED_FAILED';end if;
 v:=public.content_pipeline_validate_native_call_v2(call||'{"sceneInstruction":{"text":"A realistic stationary motorcycle cockpit photograph.","location":"TOOL_ARGUMENT"}}');
 if v->>'valid'<>'false' then raise exception 'FALSE_TOOL_ARGUMENT_ALLOWED';end if;
 v:=public.content_pipeline_validate_native_call_v2(call||'{"sceneInstruction":{"text":"A realistic stationary motorcycle cockpit photograph.","location":"CONVERSATION_MESSAGE"}}');
 if v->>'valid'<>'true' or v->>'instructionVisibility'<>'OPERATOR_REPORTED_CONVERSATION' then raise exception 'CONVERSATION_CAPTURE_FAILED';end if;
 v:=public.content_pipeline_validate_native_call_v2(call||'{"sceneInstruction":{"text":"A realistic stationary motorcycle cockpit photograph.","location":"UNOBSERVED"}}');
 if v->>'valid'<>'false' then raise exception 'UNOBSERVED_TEXT_ALLOWED';end if;
 v:=public.content_pipeline_validate_native_call_v2(call||'{"sceneInstruction":{"text":"https://example.com/?token=secret","location":"CONVERSATION_MESSAGE"}}');
 if v->>'valid'<>'false' then raise exception 'INSTRUCTION_SECRET_ALLOWED';end if;
 select * into i from public."21_content_pipeline_image" where generation_contract_hash is not null and not(status='PROCESSING' and claim_expires_at>=now()) order by pipeline_image_id limit 1;
 update public."21_content_pipeline_image" set status='PROCESSING',handoff_phase='PRODUCING',claimed_by=w,claim_token=a,claim_expires_at=now()+interval '1 hour' where pipeline_image_id=i.pipeline_image_id;
 insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,pipeline_image_id,response) values(w,r,i.pipeline_image_id,jsonb_build_object('pipelineImageId',i.pipeline_image_id,'generationContractHash',i.generation_contract_hash,'claimToken',a,'executionRole','PRODUCER'));
 q:=jsonb_build_object('contractHash',i.generation_contract_hash,'nativeCall',call);
 perform public.content_pipeline_record_native_attempt_v1(w,r,a,'REQUEST',q);
 z:=jsonb_build_object('actualNativeCall',call,'outputs','[]'::jsonb,'pixelQa','NOT_INSPECTED');
 perform public.content_pipeline_record_native_attempt_v1(w,r,a,'RESULT',z);
 audit:=public.content_pipeline_native_attempt_audit_v1(w,i.pipeline_image_id,r);
 if audit->'events'->1->'captureValidation'->>'instructionVisibility'<>'UNOBSERVED' or audit->'events'->1->>'requestMatchesActualCall'<>'true' or audit->>'serverObservedNativeCall'<>'false' then raise exception 'NULL_AUDIT_VISIBILITY_FAILED';end if;
 if (audit->'events'->0->'evidence'->'nativeCall') is distinct from call then raise exception 'RAW_ARGUMENTS_MUTATED';end if;
 a:=extensions.gen_random_uuid();
 call:=call||'{"sceneInstruction":{"text":"A realistic stationary motorcycle cockpit photograph.","location":"CONVERSATION_MESSAGE"}}';
 q:=jsonb_build_object('contractHash',i.generation_contract_hash,'nativeCall',call);
 perform public.content_pipeline_record_native_attempt_v1(w,r,a,'REQUEST',q);
 z:=jsonb_build_object('actualNativeCall',call,'outputs',jsonb_build_array(jsonb_build_object('fileId','file_test_nullable')),'inspectedOutput',jsonb_build_object('fileId','file_test_nullable'),'pixelsInspected',true,'pixelQa','PASS','pixelEvidence','Rollback fixture attestation only, no actual image generation.');
 perform public.content_pipeline_record_native_attempt_v1(w,r,a,'RESULT',z);
 audit:=public.content_pipeline_native_attempt_audit_v1(w,i.pipeline_image_id,r);
 if audit->'events'->3->'captureValidation'->>'instructionVisibility'<>'OPERATOR_REPORTED_CONVERSATION' then raise exception 'INSTRUCTION_READBACK_FAILED';end if;
 if has_function_privilege('anon','public.content_pipeline_validate_native_call_v2(jsonb)','EXECUTE') or has_function_privilege('authenticated','public.content_pipeline_native_attempt_audit_v1(text,bigint,uuid)','EXECUTE') then raise exception 'NULL_AUDIT_GRANT_LEAK';end if;
end $nullable$;
select 'LEGACY_RAW_NULLABLE_AUDIT_REGRESSION_PASS' as result;
rollback;
