begin;
do $test$
declare i public."21_content_pipeline_image"%rowtype; j public."27_content_pipeline_source_stage_job"%rowtype; q jsonb; r jsonb; item text; original_result jsonb;
 w text:='semantic-regression-'||extensions.gen_random_uuid(); request uuid:=extensions.gen_random_uuid(); token uuid:=extensions.gen_random_uuid(); run_id bigint;
begin
 select * into j from public."27_content_pipeline_source_stage_job" where status='STAGED' and approved_at is null and pipeline_image_id is not null order by created_at desc limit 1 for update;
 if not found then raise exception 'SEMANTIC_TEST_FIXTURE_REQUIRED';end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=j.pipeline_image_id for update;
 original_result:=j.result;
 if public.content_pipeline_pre_staging_gate_v1(i.pipeline_image_id,i.generation_contract_hash,j.spec||'{"preflightOnly":true,"transform":{}}',j.result->'provenance'->>'sourceSha256')->>'status'<>'PREFLIGHT_ONLY' then raise exception 'UNANNOTATED_PREVIEW_REJECTED';end if;
 update public."27_content_pipeline_source_stage_job" set result=result||jsonb_build_object('preflightOnly',true,'preStagingSourceSha256',repeat('a',64)) where job_id=j.job_id;
 q:=jsonb_build_object('pipelineImageId',i.pipeline_image_id,'contractHash',i.generation_contract_hash,'sourceJobId',j.job_id,'sourceSha256',repeat('a',64),'pixelsInspected',true,'status','PASS','evidence','Actual preview target pixels checked for this test.','inspectionTargetVerified',true,'mustShowChecks','{}'::jsonb,'mustNotShowChecks','{}'::jsonb,'annotationTargetChecks','{}'::jsonb);
 for item in select jsonb_array_elements_text(coalesce(i.generation_contract->'must_show','[]')) loop q:=jsonb_set(q,array['mustShowChecks',item],'"PASS"');end loop;
 for item in select jsonb_array_elements_text(coalesce(i.generation_contract->'must_not_show','[]')) loop q:=jsonb_set(q,array['mustNotShowChecks',item],'"PASS"');end loop;
 for item in select jsonb_array_elements_text(coalesce(i.generation_contract->'annotation_contract'->'target_labels','[]')) loop q:=jsonb_set(q,array['annotationTargetChecks',item],'"PASS"');end loop;
 r:=public.content_pipeline_pre_staging_gate_v1(i.pipeline_image_id,i.generation_contract_hash,j.spec||jsonb_build_object('preflightOnly',false,'preStagingQa',q),repeat('a',64));
 if r->>'status'<>'PASS' then raise exception 'BOUND_QA_NOT_ACCEPTED';end if;
 begin perform public.content_pipeline_pre_staging_gate_v1(i.pipeline_image_id,i.generation_contract_hash,j.spec||jsonb_build_object('preflightOnly',false,'preStagingQa',q),repeat('b',64));raise exception 'WRONG_SOURCE_SHA_ACCEPTED';exception when others then if sqlerrm<>'PRE_STAGING_VISUAL_QA_REQUIRED' then raise;end if;end;
 begin perform public.content_pipeline_pre_staging_gate_v1(i.pipeline_image_id,'wrong-contract',j.spec,repeat('a',64));raise exception 'WRONG_CONTRACT_ACCEPTED';exception when others then if sqlerrm<>'PRE_STAGING_CONTRACT_CHANGED' then raise;end if;end;
 -- Active owned test claim, rolled back after rejection.
 select pipeline_image_run_id into run_id from public."23_content_pipeline_image_run" where pipeline_image_id=i.pipeline_image_id order by pipeline_image_run_id desc limit 1;
 update public."21_content_pipeline_image" set status='PROCESSING',handoff_phase='PRODUCING',claimed_by=w,claim_token=token,claim_expires_at=now()+interval '10 minutes' where pipeline_image_id=i.pipeline_image_id;
 update public."23_content_pipeline_image_run" set status='RUNNING',claim_token=token,worker_key=w where pipeline_image_run_id=run_id;
 insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,target_image_id,pipeline_image_id,response) values(w,request,i.pipeline_image_id,i.pipeline_image_id,jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineId',i.pipeline_id,'pipelineImageRunId',run_id,'claimToken',token,'generationContractHash',i.generation_contract_hash));
 r:=public.content_pipeline_register_pre_staging_qa_v1(w,request,j.job_id,j.result->>'sha256',q);
 if r->>'approvalPerformed'<>'false' then raise exception 'PREVIEW_APPROVED';end if;
 begin perform public.content_pipeline_reject_visual_source_v1(w,request,j.job_id,j.result->>'sha256',null,null);raise exception 'NULL_EVIDENCE_ACCEPTED';exception when others then if sqlerrm<>'SEMANTIC_REJECTION_EVIDENCE_REQUIRED' then raise;end if;end;
 r:=public.content_pipeline_reject_visual_source_v1(w,request,j.job_id,j.result->>'sha256','SOURCE_MISMATCH','Actual pixels show an unrelated target; keep Claim for replacement.');
 if r->>'activeClaim'<>'true' then raise exception 'REJECTION_CLOSED_CLAIM';end if;
 if public.content_pipeline_visual_recovery_v1(i.pipeline_image_id)->>'jobId'=j.job_id::text then raise exception 'INVALID_JOB_RECOVERED';end if;
 begin perform public.content_pipeline_approve_source_stage_v1(j.job_id,token,j.result->>'sha256','{}');raise exception 'INVALID_ASSET_APPROVED';exception when others then if sqlerrm<>'SEMANTICALLY_INVALID_OR_PREFLIGHT_ASSET' then raise;end if;end;
 begin perform public.content_pipeline_pre_staging_gate_v1(i.pipeline_image_id,i.generation_contract_hash,j.spec||jsonb_build_object('preflightOnly',false,'preStagingQa',q),repeat('a',64));raise exception 'REJECTED_SOURCE_RESURRECTED';exception when others then if sqlerrm<>'SEMANTICALLY_REJECTED_SOURCE' then raise;end if;end;
 if not public.content_pipeline_visual_claim_request_status_v1(w,request)->>'activeClaim'='true' then raise exception 'CLAIM_NOT_PRESERVED';end if;
end $test$;
rollback;
