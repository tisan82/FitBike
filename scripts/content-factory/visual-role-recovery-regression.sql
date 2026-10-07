begin;
-- Protocol fixtures borrow existing Storage bytes. All image/job/claim changes roll back.
do $test$
declare
 i public."21_content_pipeline_image"%rowtype; j public."27_content_pipeline_source_stage_job"%rowtype;
 w text:='role-recovery-'||extensions.gen_random_uuid(); p uuid:=extensions.gen_random_uuid();
 p2 uuid:=extensions.gen_random_uuid(); r uuid:=extensions.gen_random_uuid();
 job uuid:=extensions.gen_random_uuid(); bad uuid:=extensions.gen_random_uuid(); finaljob uuid:=extensions.gen_random_uuid();
 x jsonb; y jsonb; qa jsonb; oldhash text;
begin
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."27_content_pipeline_source_stage_job" j0 on j0.pipeline_image_id=i0.pipeline_image_id
 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id
 where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL')
 and public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,j0.job_id) is not null
 and not (i0.status='PROCESSING' and i0.claim_expires_at>=now())
 and (j0.spec->>'preflightOnly'='true' or j0.result->>'preflightOnly'='true')
 order by j0.created_at desc limit 1;
 if not found then raise exception 'VALID_STORED_PREFLIGHT_FIXTURE_REQUIRED';end if;
 select j0.* into j from public."27_content_pipeline_source_stage_job" j0
 where j0.pipeline_image_id=i.pipeline_image_id and public.content_pipeline_review_candidate_v1(i.pipeline_image_id,j0.job_id) is not null
 and (j0.spec->>'preflightOnly'='true' or j0.result->>'preflightOnly'='true')
 order by j0.created_at desc limit 1;
 update public."21_content_pipeline_image" set status='PENDING',staging_asset=null,review_candidate=null,
 visual_phase='PRODUCTION_PENDING',claimed_by=null,claim_token=null,claim_expires_at=null,next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result)
 values(job,i.pipeline_image_id,j.claim_token,j.contract_hash,
 j.spec||jsonb_build_object('sourcePdfPage',2,'visualMcpOperation',jsonb_build_object('workerKey',w,'requestId',p,'operationId',extensions.gen_random_uuid())),
 'STAGED',extensions.digest('recovery-fixture','sha256'),j.result);
 if public.content_pipeline_owned_visual_candidate_v1(w,i.pipeline_image_id)->>'jobId' is distinct from job::text then raise exception 'OWNED_PREFLIGHT_NOT_DISCOVERED';end if;
 if public.content_pipeline_owned_visual_candidate_v1(w||'-foreign',i.pipeline_image_id) is not null then raise exception 'FOREIGN_PREFLIGHT_LEAK';end if;
 oldhash:=i.generation_contract_hash;
 update public."21_content_pipeline_image" set generation_contract_hash=repeat('0',64) where pipeline_image_id=i.pipeline_image_id;
 if public.content_pipeline_owned_visual_candidate_v1(w,i.pipeline_image_id) is not null then raise exception 'STALE_CONTRACT_RECOVERY_ALLOWED';end if;
 update public."21_content_pipeline_image" set generation_contract_hash=oldhash where pipeline_image_id=i.pipeline_image_id;
 update public."27_content_pipeline_source_stage_job" set result=result||'{"decode":"FAIL"}'::jsonb where job_id=job;
 if public.content_pipeline_owned_visual_candidate_v1(w,i.pipeline_image_id) is not null then raise exception 'UNDECODED_ASSET_RECOVERABLE';end if;
 update public."27_content_pipeline_source_stage_job" set result=j.result where job_id=job;
 x:=public.content_pipeline_claim_visual_stage_v1(w,p,'PRODUCER',i.pipeline_image_id);
 if x->>'activeClaim' is distinct from 'true' or x->>'nextAction' is distinct from 'HANDOFF_EXISTING_PRODUCTION_CANDIDATE' then raise exception 'PRODUCER_RECOVERY_ROUTING_FAILED: %',x;end if;
 x:=public.content_pipeline_fail_visual_request_v1(w,p,'RETRY','HANDOFF_PROTOCOL','FIXTURE','Technical handoff interruption');
 if x->>'visualPhase' is distinct from 'PRODUCTION_PENDING' or x->>'activeClaim' is distinct from 'false'
 or x->>'nextAction' is distinct from 'RECLAIM_OWN_ROLE_BEFORE_WRITE' or x->>'resumeFrom' is distinct from 'PRODUCTION_HANDOFF'
 or x->'recoverableProductionCandidate'->>'jobId' is distinct from job::text then raise exception 'PRODUCER_FAILURE_RECOVERY_LOST: %',x;end if;
 if not exists(select 1 from public."21_content_pipeline_image" where pipeline_image_id=i.pipeline_image_id and retry_action='HANDOFF_EXISTING_PRODUCTION_CANDIDATE') then raise exception 'FAILURE_RETRY_ACTION_LOST';end if;
 update public."21_content_pipeline_image" set next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 x:=public.content_pipeline_claim_visual_stage_v1(w,p2,'PRODUCER',i.pipeline_image_id);
 begin perform public.content_pipeline_register_pre_staging_qa_v1(w,p2,job,j.result->>'sha256','{}');raise exception 'PRODUCER_QA_ALLOWED';exception when others then if sqlerrm<>'REVIEWER_REQUEST_REQUIRED' then raise;end if;end;
 y:=public.content_pipeline_handoff_visual_review_v1(w,p2,job,j.result->>'sha256');
 if y->>'visualPhase' is distinct from 'QA_PENDING' or y->>'activeClaim' is distinct from 'false' then raise exception 'HANDOFF_NOT_ATOMIC';end if;
 if public.content_pipeline_visual_claim_request_status_v1(w,p2)->>'nextAction' is distinct from 'FOLLOW_TASK_STATUS' then raise exception 'CLOSED_PRODUCER_DIRECTED_TO_WRITE';end if;
 y:=public.content_pipeline_claim_visual_stage_v1(w,r,'REVIEWER',i.pipeline_image_id);
 if y->>'nextAction' is distinct from 'INSPECT_REVIEW_CANDIDATE' then raise exception 'REVIEWER_ROUTING_FAILED: %',y;end if;
 -- Different PDF page rejection must not poison this page; same raw PDF SHA preserved.
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result)
 values(bad,i.pipeline_image_id,j.claim_token,j.contract_hash,j.spec||'{"sourcePdfPage":1}'::jsonb,'STAGED',extensions.digest('other-page','sha256'),
 j.result||jsonb_build_object('sha256',repeat('f',64),'semanticValidation',jsonb_build_object('status','FAIL','reason','SOURCE_MISMATCH')));
 if public.content_pipeline_owned_visual_candidate_v1(w,i.pipeline_image_id) is null then raise exception 'OTHER_PDF_PAGE_POISONED_CANDIDATE';end if;
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result)
 values(finaljob,i.pipeline_image_id,j.claim_token,j.contract_hash,
 j.spec||jsonb_build_object('preflightOnly',false,'sourcePdfPage',2,'preStagingQa',jsonb_build_object('sourceJobId',job,'sourceSha256',j.result->>'preStagingSourceSha256'),'visualMcpOperation',jsonb_build_object('workerKey',w,'requestId',r)),
 'STAGED',extensions.digest('final-page','sha256'),j.result||'{"preflightOnly":false}'::jsonb);
 qa:=jsonb_build_object('contractHash',j.contract_hash,'imageQa','PASS','mobileQa','PASS','imageSeoQa','PASS','representativeImageQa','PASS','cardCropQa','PASS','heroCropQa','PASS');
 -- A newer same-worker job from another parent must not hide the older attested derivative.
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result,created_at)
 values(extensions.gen_random_uuid(),i.pipeline_image_id,j.claim_token,j.contract_hash,
 j.spec||jsonb_build_object('preflightOnly',false,'sourcePdfPage',2,'preStagingQa',jsonb_build_object('sourceJobId',extensions.gen_random_uuid(),'sourceSha256',j.result->>'preStagingSourceSha256'),'visualMcpOperation',jsonb_build_object('workerKey',w,'requestId',r)),
 'STAGED',extensions.digest('cross-parent','sha256'),j.result||'{"preflightOnly":false}'::jsonb,now()+interval '1 second');
 if public.content_pipeline_owned_visual_recovery_v1(w,i.pipeline_image_id)->>'jobId' is distinct from finaljob::text then raise exception 'NEWER_CROSS_PARENT_HID_VALID_DERIVATIVE';end if;
 if public.content_pipeline_owned_visual_recovery_v1(w||'-foreign',i.pipeline_image_id) is not null then raise exception 'FOREIGN_FINAL_RECOVERY_ALLOWED';end if;
 begin
 x:=public.content_pipeline_approve_source_stage_v1(finaljob,(y->'claim'->>'claimToken')::uuid,j.result->>'sha256',qa);
 if x->>'status' is distinct from 'READY_FOR_UPLOAD' then raise exception 'PAGE_SCOPED_APPROVAL_FAILED';end if;
 if public.content_pipeline_owned_visual_recovery_v1(w,i.pipeline_image_id)->>'approved' is distinct from 'true' then raise exception 'OWNED_APPROVED_ASSET_RECOVERY_LOST';end if;
 raise exception 'ROLLBACK_PAGE_APPROVAL_FIXTURE';
 exception when others then if sqlerrm<>'ROLLBACK_PAGE_APPROVAL_FIXTURE' then raise;end if;end;
 update public."27_content_pipeline_source_stage_job" set spec=spec||'{"sourcePdfPage":2}'::jsonb where job_id=bad;
 begin perform public.content_pipeline_approve_source_stage_v1(finaljob,(y->'claim'->>'claimToken')::uuid,j.result->>'sha256',qa);raise exception 'SAME_PAGE_REJECTION_BYPASSED';exception when others then if sqlerrm<>'SEMANTICALLY_INVALID_OR_PREFLIGHT_ASSET' then raise;end if;end;
 delete from public."27_content_pipeline_source_stage_job" where job_id in(bad,finaljob);
 x:=public.content_pipeline_fail_visual_request_v1(w,r,'RETRY','QA_RECORD','FIXTURE','Reviewer interruption');
 if x->>'visualPhase' is distinct from 'QA_PENDING' or x->>'nextAction' is distinct from 'RECLAIM_OWN_ROLE_BEFORE_WRITE'
 or x->>'resumeFrom' is distinct from 'REVIEW_CANDIDATE_INSPECTION' then raise exception 'REVIEWER_FAILURE_RECOVERY_LOST: %',x;end if;
 if has_function_privilege('anon','public.content_pipeline_owned_visual_candidate_v1(text,bigint)','EXECUTE')
 or has_function_privilege('authenticated','public.content_pipeline_owned_visual_candidate_v1(text,bigint)','EXECUTE') then raise exception 'HELPER_PUBLICLY_CALLABLE';end if;
 if has_function_privilege('anon','public.content_pipeline_owned_visual_recovery_v1(text,bigint)','EXECUTE')
 or has_function_privilege('authenticated','public.content_pipeline_owned_visual_recovery_v1(text,bigint)','EXECUTE') then raise exception 'FINAL_HELPER_PUBLICLY_CALLABLE';end if;
end $test$;
rollback;
