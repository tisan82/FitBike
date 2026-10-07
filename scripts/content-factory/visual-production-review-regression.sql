begin;
do $test$
declare
 i public."21_content_pipeline_image"%rowtype;j public."27_content_pipeline_source_stage_job"%rowtype;
 w text:='split-regression-'||extensions.gen_random_uuid();p uuid:=extensions.gen_random_uuid();r uuid:=extensions.gen_random_uuid();r2 uuid:=extensions.gen_random_uuid();job uuid:=extensions.gen_random_uuid();x jsonb;y jsonb;token text;candidate jsonb;foreign_job uuid:=extensions.gen_random_uuid();qa jsonb;
begin
 -- Isolated, rolled-back protocol fixture uses an existing real stored binary, never changes its bytes.
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."27_content_pipeline_source_stage_job" j0 on j0.pipeline_image_id=i0.pipeline_image_id
 where public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,j0.job_id) is not null
 and not (i0.status='PROCESSING' and i0.claim_expires_at>=now()) order by j0.created_at desc limit 1;
 if not found then raise exception 'VALID_STORED_FIXTURE_REQUIRED';end if;
 select j0.* into j from public."27_content_pipeline_source_stage_job" j0 where public.content_pipeline_review_candidate_v1(i.pipeline_image_id,j0.job_id) is not null order by created_at desc limit 1;
 update public."21_content_pipeline_image" set status='PENDING',staging_asset=null,review_candidate=null,visual_phase=null,claimed_by=null,claim_token=null,claim_expires_at=null,next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 x:=public.content_pipeline_claim_visual_stage_v1(w,p,'PRODUCER',i.pipeline_image_id);
 if x->>'activeClaim' is distinct from 'true' then raise exception 'PRODUCER_CLAIM_FAILED: %',x;end if;
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result)
 values(job,i.pipeline_image_id,(x->'claim'->>'claimToken')::uuid,j.contract_hash,j.spec||jsonb_build_object('visualMcpOperation',jsonb_build_object('workerKey',w,'requestId',p,'operationId',extensions.gen_random_uuid())),'STAGED',extensions.digest('regression','sha256'),j.result);
 begin perform public.content_pipeline_register_pre_staging_qa_v1(w,p,job,j.result->>'sha256','{}');raise exception 'PRODUCER_QA_ALLOWED';exception when others then if sqlerrm<>'REVIEWER_REQUEST_REQUIRED' then raise;end if;end;
 begin perform public.content_pipeline_approve_source_stage_v1(job,(x->'claim'->>'claimToken')::uuid,j.result->>'sha256','{}');raise exception 'PRODUCER_APPROVAL_ALLOWED';exception when others then if sqlerrm not in ('REVIEWER_REQUEST_REQUIRED','SEMANTICALLY_INVALID_OR_PREFLIGHT_ASSET') then raise;end if;end;
 begin perform public.content_pipeline_handoff_visual_review_v1(w,p,job,repeat('0',64));raise exception 'WRONG_SHA_ALLOWED';exception when others then if sqlerrm<>'REVIEW_CANDIDATE_INVALID' then raise;end if;end;
 y:=public.content_pipeline_handoff_visual_review_v1(w,p,job,j.result->>'sha256');
 if y->>'activeClaim'<>'false' or y->>'visualPhase'<>'QA_PENDING' then raise exception 'HANDOFF_NOT_ATOMIC: %',y;end if;
 if public.content_pipeline_claim_visual_request_v1(w,extensions.gen_random_uuid(),i.pipeline_image_id)->>'result'<>'SKIP' then raise exception 'LEGACY_CONSUMED_QA_PENDING';end if;
 if public.content_pipeline_claim_visual_stage_v1(w||'-other',extensions.gen_random_uuid(),'REVIEWER',i.pipeline_image_id)->>'result'<>'SKIP' then raise exception 'OTHER_OPERATOR_CONSUMED_ASSET';end if;
 y:=public.content_pipeline_claim_visual_stage_v1(w,r,'REVIEWER',i.pipeline_image_id);
 if y->>'activeClaim'<>'true' or y->>'visualPhase'<>'REVIEWING' then raise exception 'REVIEW_CLAIM_FAILED: %',y;end if;
 token:=y->'claim'->>'claimToken';
 x:=public.content_pipeline_handoff_visual_review_v1(w,p,job,j.result->>'sha256');
 if x->>'visualPhase'<>'REVIEWING' or x->>'activeClaim'<>'false' or public.content_pipeline_visual_claim_request_status_v1(w,r)->'claim'->>'claimToken'<>token then raise exception 'REPLAY_CHANGED_NEW_CLAIM';end if;
 begin perform public.content_pipeline_visual_role_guard_v1(w,r,'DISPATCH',jsonb_build_object('chatFile',jsonb_build_object('file_id','new')));raise exception 'REVIEW_NEW_FILE_ALLOWED';exception when others then if sqlerrm<>'REVIEW_RESUME_REQUIRED' then raise;end if;end;
 begin perform public.content_pipeline_visual_role_guard_v1(w,r,'QA',jsonb_build_object('jobId',j.job_id));raise exception 'OTHER_QA_JOB_ALLOWED';exception when others then if sqlerrm<>'REVIEW_CANDIDATE_INVALID' then raise;end if;end;
 -- Approval is bound to the parent or an attested derivative, with fail-closed NULL checks.
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result)
 values(foreign_job,i.pipeline_image_id,token::uuid,j.contract_hash,(j.spec-'preStagingQa')||'{"preflightOnly":false}'::jsonb,'STAGED',extensions.digest('foreign','sha256'),j.result||'{"preflightOnly":false}'::jsonb);
 begin perform public.content_pipeline_approve_source_stage_v1(foreign_job,token::uuid,j.result->>'sha256',jsonb_build_object('contractHash',j.contract_hash));raise exception 'UNATTESTED_JOB_APPROVAL_ALLOWED';exception when others then if sqlerrm<>'REVIEW_CANDIDATE_INVALID' then raise;end if;end;
 update public."27_content_pipeline_source_stage_job" set spec=spec||jsonb_build_object('preStagingQa',jsonb_build_object('sourceJobId',null,'sourceSha256',null)) where job_id=foreign_job;
 begin perform public.content_pipeline_approve_source_stage_v1(foreign_job,token::uuid,j.result->>'sha256',jsonb_build_object('contractHash',j.contract_hash));raise exception 'NULL_ATTESTATION_APPROVAL_ALLOWED';exception when others then if sqlerrm<>'REVIEW_CANDIDATE_INVALID' then raise;end if;end;
 -- Positive final approval protocol is contained in an exception subtransaction, never persistent QA.
 begin
  update public."27_content_pipeline_source_stage_job" set spec=spec||jsonb_build_object('preStagingQa',jsonb_build_object('sourceJobId',job,'sourceSha256',j.result->>'preStagingSourceSha256'),'visualMcpOperation',jsonb_build_object('workerKey',w,'requestId',r)) where job_id=foreign_job;
  qa:=jsonb_build_object('contractHash',j.contract_hash,'imageQa','PASS','mobileQa','PASS','imageSeoQa','PASS','representativeImageQa','PASS','cardCropQa','PASS','heroCropQa','PASS');
  x:=public.content_pipeline_approve_source_stage_v1(foreign_job,token::uuid,j.result->>'sha256',qa);
  if x->>'status'<>'READY_FOR_UPLOAD' or public.content_pipeline_visual_claim_request_status_v1(w,r)->>'activeClaim'<>'false' then raise exception 'FINAL_APPROVAL_PROTOCOL_FAILED';end if;
  raise exception 'ROLLBACK_POSITIVE_APPROVAL_FIXTURE';
 exception when others then if sqlerrm<>'ROLLBACK_POSITIVE_APPROVAL_FIXTURE' then raise;end if;end;
 update public."27_content_pipeline_source_stage_job" set spec=spec||jsonb_build_object('preStagingQa',jsonb_build_object('sourceJobId',job,'sourceSha256',j.result->>'preStagingSourceSha256'),'visualMcpOperation',jsonb_build_object('workerKey',w,'requestId',r)) where job_id=foreign_job;
 -- Technical failure retains candidate and cooldown; no regeneration.
 x:=public.content_pipeline_fail_visual_request_v1(w,r,'RETRY','QA_RECORD','PAYLOAD_ERROR','fixture technical failure');
 if x->>'visualPhase'<>'QA_PENDING' or x->>'activeClaim'<>'false' then raise exception 'TECHNICAL_FAILURE_LOST_CANDIDATE';end if;
 if public.content_pipeline_claim_visual_stage_v1(w,r2,'REVIEWER',i.pipeline_image_id)->>'result'<>'SKIP' then raise exception 'COOLDOWN_BYPASSED';end if;
 update public."21_content_pipeline_image" set next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 r2:=extensions.gen_random_uuid();y:=public.content_pipeline_claim_visual_stage_v1(w,r2,'REVIEWER',i.pipeline_image_id);
 if y->>'activeClaim'<>'true' then raise exception 'REVIEW_RECOVERY_FAILED';end if;
 if y->'claim'->>'claimToken'=token then raise exception 'RECOVERY_TOKEN_REUSED';end if;
 begin
  x:=public.content_pipeline_approve_source_stage_v1(foreign_job,(y->'claim'->>'claimToken')::uuid,j.result->>'sha256',qa);
  if x->>'status'<>'READY_FOR_UPLOAD' then raise exception 'HISTORICAL_DERIVATIVE_RECOVERY_FAILED';end if;
  raise exception 'ROLLBACK_RECOVERY_APPROVAL_FIXTURE';
 exception when others then if sqlerrm<>'ROLLBACK_RECOVERY_APPROVAL_FIXTURE' then raise;end if;end;
 delete from public."27_content_pipeline_source_stage_job" where job_id=foreign_job;
 update public."21_content_pipeline_image" set claim_expires_at=now()-interval '1 minute' where pipeline_image_id=i.pipeline_image_id;
 r2:=extensions.gen_random_uuid();y:=public.content_pipeline_claim_visual_stage_v1(w,r2,'REVIEWER',i.pipeline_image_id);
 if y->>'activeClaim'<>'true' then raise exception 'EXPIRED_REVIEW_RECLAIM_FAILED';end if;
 x:=public.content_pipeline_reject_visual_source_v1(w,r2,job,j.result->>'sha256','MUST_SHOW_MISMATCH','Regression semantic rejection of fixture');
 x:=public.content_pipeline_fail_visual_request_v1(w,r2,'RETRY','PIXEL_QA','MUST_SHOW_MISMATCH','Regression semantic rejection of fixture');
 if x->>'visualPhase'<>'PRODUCTION_PENDING' or x->'reviewCandidate'<>'null'::jsonb then raise exception 'SEMANTIC_FAILURE_NOT_RETURNED';end if;
 if public.content_pipeline_review_candidate_v1(i.pipeline_image_id,job) is not null then raise exception 'INVALID_ASSET_RECOVERABLE';end if;
 -- Input role is immutable for an execution request ID.
 begin perform public.content_pipeline_claim_visual_stage_v1(w,p,'REVIEWER',i.pipeline_image_id);raise exception 'ROLE_REPLAY_CONFLICT_ALLOWED';exception when others then if sqlerrm<>'VISUAL_REQUEST_INPUT_CONFLICT' then raise;end if;end;
end $test$;
rollback;
