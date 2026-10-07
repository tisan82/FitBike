begin;
-- Reuses existing preserved Storage bytes, creates protocol fixtures only. No Native call or QA PASS asserted.
do $test$
declare i public."21_content_pipeline_image"%rowtype; j public."27_content_pipeline_source_stage_job"%rowtype;
 w text:='native-recovery-'||extensions.gen_random_uuid(); job uuid:=extensions.gen_random_uuid(); bad uuid:=extensions.gen_random_uuid();
 req uuid:=extensions.gen_random_uuid(); nextreq uuid:=extensions.gen_random_uuid(); x jsonb; dispatched jsonb; oldhash text; audit_op uuid:=extensions.gen_random_uuid();
begin
 select j0.* into j from public."27_content_pipeline_source_stage_job" j0
 join public."21_content_pipeline_image" i0 on i0.pipeline_image_id=j0.pipeline_image_id
 join storage.objects o on o.bucket_id=j0.result->'generatedInput'->>'bucket' and o.name=j0.result->'generatedInput'->>'path'
 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id
 where j0.result->'generatedInput'->>'decode'='PASS' and j0.contract_hash=i0.generation_contract_hash
 and public.content_pipeline_reference_generation_allowed_v1(i0.generation_contract,j0.spec->>'productionMethod')
 and p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL')
 and not(i0.status='PROCESSING' and i0.claim_expires_at>=now()) order by j0.created_at desc limit 1;
 if not found then raise exception 'PRESERVED_INPUT_FIXTURE_REQUIRED';end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=j.pipeline_image_id;
 update public."21_content_pipeline_image" set status='PENDING',visual_phase='PRODUCTION_PENDING',staging_asset=null,review_candidate=null,
 claimed_by=null,claim_token=null,claim_expires_at=null,next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 -- Keep fixture identity separate from prior semantic rejections while using actually stored input bytes.
 delete from public."27_content_pipeline_source_stage_job" where pipeline_image_id=i.pipeline_image_id and result->'semanticValidation'->>'status'='FAIL';
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result)
 values(job,i.pipeline_image_id,j.claim_token,j.contract_hash,j.spec||jsonb_build_object('preflightOnly',true,'visualMcpOperation',jsonb_build_object('workerKey',w,'requestId',req)),
 'FAILED',extensions.digest('input-fixture','sha256'),jsonb_build_object('checkpoint','GENERATED_BINARY_PRESERVED','generatedInput',j.result->'generatedInput','generation',j.result->'generation'));
 x:=public.content_pipeline_owned_native_input_v1(w,i.pipeline_image_id);
 if x->>'sourceJobId' is distinct from job::text or x->>'status' is distinct from 'INPUT_PRESERVED' or x->>'canonicalSha256' is not null or x->>'sourceSha256' is distinct from j.result->'generatedInput'->>'sha256' or x->>'qaStatus' is distinct from 'NOT_EVALUATED' then raise exception 'INPUT_RECEIPT_INCORRECT: %',x;end if;
 if public.content_pipeline_owned_native_input_v1(w||'-foreign',i.pipeline_image_id) is not null then raise exception 'FOREIGN_INPUT_LEAK';end if;
 -- Audit fixture asserts technical receipt vs operator record only; no imagegen invocation is simulated.
 update public."27_content_pipeline_source_stage_job" set spec=jsonb_set(spec-'chatFile','{visualMcpOperation,operationId}',to_jsonb(audit_op::text))||jsonb_build_object('nativeAttemptBinding',jsonb_build_object('inspectedOutput',jsonb_build_object('fileId','file-regression'))) where job_id=job;
 insert into public."30_content_pipeline_native_attempt_event"(worker_key,request_id,attempt_id,attempt_number,phase,pipeline_image_id,contract_hash,evidence)
 values(w,req,extensions.gen_random_uuid(),1,'TRANSPORT_ERROR',i.pipeline_image_id,j.contract_hash,jsonb_build_object('operationId',audit_op));
 x:=public.content_pipeline_native_attempt_audit_v1(w,i.pipeline_image_id,req)->'events'->0->'serverReceivedJobs'->0;
 if x->>'jobAccepted' is distinct from 'true' or x->>'binaryReceipt' is distinct from 'CONFIRMED'
 or x->>'normalizedInputSha' is distinct from j.result->'generatedInput'->>'sha256'
 or x->>'receivedFileId' is distinct from 'file-regression' then raise exception 'AUDIT_RECEIPT_IDENTITY_LOST: %',x;end if;
 update public."27_content_pipeline_source_stage_job" set result='{}' where job_id=job;
 if public.content_pipeline_native_attempt_audit_v1(w,i.pipeline_image_id,req)->'events'->0->'serverReceivedJobs'->0->>'binaryReceipt' is distinct from 'UNKNOWN' then raise exception 'JOB_ACCEPTED_PRETENDS_BINARY_RECEIVED';end if;
 update public."27_content_pipeline_source_stage_job" set result=jsonb_build_object('checkpoint','GENERATED_BINARY_PRESERVED','generatedInput',j.result->'generatedInput','generation',j.result->'generation') where job_id=job;
 oldhash:=i.generation_contract_hash;
 update public."21_content_pipeline_image" set generation_contract_hash=repeat('0',64) where pipeline_image_id=i.pipeline_image_id;
 if public.content_pipeline_owned_native_input_v1(w,i.pipeline_image_id) is not null then raise exception 'STALE_HASH_RECOVERY';end if;
 update public."21_content_pipeline_image" set generation_contract_hash=oldhash where pipeline_image_id=i.pipeline_image_id;
 update public."27_content_pipeline_source_stage_job" set result=jsonb_set(result,'{generatedInput,decode}','"FAIL"') where job_id=job;
 if public.content_pipeline_owned_native_input_v1(w,i.pipeline_image_id) is not null then raise exception 'BAD_DECODE_RECOVERY';end if;
 update public."27_content_pipeline_source_stage_job" set result=jsonb_set(result,'{generatedInput,decode}','"PASS"') where job_id=job;
 update public."27_content_pipeline_source_stage_job" set result=jsonb_set(result,'{generatedInput,width}','900000') where job_id=job;
 if public.content_pipeline_owned_native_input_v1(w,i.pipeline_image_id) is not null then raise exception 'OVERSIZED_PIXEL_INPUT_RECOVERY';end if;
 update public."27_content_pipeline_source_stage_job" set result=jsonb_set(result,'{generatedInput,width}',j.result->'generatedInput'->'width') where job_id=job;
 update public."27_content_pipeline_source_stage_job" set result=result-'checkpoint' where job_id=job;
 if public.content_pipeline_owned_native_input_v1(w,i.pipeline_image_id) is not null then raise exception 'UNCOMMITTED_INPUT_RECOVERY';end if;
 update public."27_content_pipeline_source_stage_job" set result=result||'{"checkpoint":"GENERATED_BINARY_PRESERVED"}' where job_id=job;
 x:=public.content_pipeline_claim_visual_stage_v1(w,req,'PRODUCER',i.pipeline_image_id);
 if x->>'activeClaim' is distinct from 'true' or x->>'nextAction' is distinct from 'RESUME_PRESERVED_NATIVE_INPUT'
 or x->'recoverableStaging'<>'null'::jsonb or x->'recoverableNativeInput'->>'sourceJobId' is distinct from job::text then raise exception 'INPUT_CLAIM_ROUTING_FAILED: %',x;end if;
 update public."29_content_pipeline_visual_claim_request" set response=response||'{"executionRole":"REVIEWER"}' where worker_key=w and request_id=req;
 if public.content_pipeline_visual_claim_request_status_v1(w,req)->'recoverableNativeInput'<>'null'::jsonb then raise exception 'REVIEWER_INPUT_RECOVERY_EXPOSED';end if;
 update public."29_content_pipeline_visual_claim_request" set response=response||'{"executionRole":"PRODUCER"}' where worker_key=w and request_id=req;
 perform public.content_pipeline_visual_role_guard_v1(w,req,'DISPATCH',x->'recoverableNativeInput'->'spec');
 -- pg_net only sends after commit; this transaction rolls back, so no HTTP worker executes.
 dispatched:=public.content_pipeline_dispatch_visual_generation_request_v1(w,req,extensions.gen_random_uuid(),x->'recoverableNativeInput'->'spec');
 if dispatched->>'status' is distinct from 'DISPATCHED' or not exists(select 1 from public."27_content_pipeline_source_stage_job" where job_id=(dispatched->>'jobId')::uuid and spec->>'resumeJobId'=job::text and spec->>'productionMethod'=j.spec->>'productionMethod') then raise exception 'FAILED_INPUT_DISPATCH_NOT_ACCEPTED: %',dispatched;end if;
 delete from public."27_content_pipeline_source_stage_job" where job_id=(dispatched->>'jobId')::uuid;
 x:=public.content_pipeline_fail_visual_request_v1(w,req,'RETRY','STORAGE_TRANSFORM','FIXTURE','Input preserved but transform interrupted');
 if x->>'activeClaim' is distinct from 'false' or x->>'resumeFrom' is distinct from 'SOURCE_STAGE' or x->'recoverableNativeInput'->>'sourceJobId' is distinct from job::text then raise exception 'FAILED_CLOSE_LOST_INPUT: %',x;end if;
 begin perform public.content_pipeline_visual_role_guard_v1(w,req,'DISPATCH',x->'recoverableNativeInput'->'spec');raise exception 'CLOSED_REQUEST_WRITE_ALLOWED';exception when others then if sqlerrm<>'ACTIVE_VISUAL_CLAIM_REQUIRED' then raise;end if;end;
 update public."21_content_pipeline_image" set next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 x:=public.content_pipeline_claim_visual_stage_v1(w,nextreq,'PRODUCER',i.pipeline_image_id);
 if x->'recoverableNativeInput'->>'sourceJobId' is distinct from job::text then raise exception 'NEW_REQUEST_INPUT_LOST';end if;
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result)
 values(bad,i.pipeline_image_id,j.claim_token,j.contract_hash,j.spec,'FAILED',extensions.digest('semantic-rejection','sha256'),
 jsonb_build_object('generatedInput',j.result->'generatedInput','semanticValidation',jsonb_build_object('status','FAIL','reason','SOURCE_MISMATCH')));
 if public.content_pipeline_owned_native_input_v1(w,i.pipeline_image_id) is not null then raise exception 'REJECTED_IDENTITY_RECOVERY';end if;
 if has_function_privilege('anon','public.content_pipeline_owned_native_input_v1(text,bigint)','EXECUTE')
 or has_function_privilege('authenticated','public.content_pipeline_owned_native_input_v1(text,bigint)','EXECUTE')
 or not has_function_privilege('service_role','public.content_pipeline_owned_native_input_v1(text,bigint)','EXECUTE') then raise exception 'INPUT_HELPER_ACL_INVALID';end if;
end $test$;
rollback;
