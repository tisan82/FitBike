-- Transactional regression: every fixture change is rolled back. No dispatch or upload.
begin;
do $test$
declare i public."21_content_pipeline_image"%rowtype; v_run bigint; j uuid;
 w text:='visual-recovery-regression-'||extensions.gen_random_uuid()::text;
 owner_id uuid:=extensions.gen_random_uuid(); alias_id uuid:=extensions.gen_random_uuid();
 other_id uuid:=extensions.gen_random_uuid(); tok uuid:=extensions.gen_random_uuid(); c jsonb; receipt jsonb; before_asset jsonb;
begin
 select * into i from public."21_content_pipeline_image" where status<>'PROCESSING'
   and public.content_pipeline_visual_recovery_v1(pipeline_image_id) is not null
 order by pipeline_image_id limit 1 for update;
 if not found then raise exception 'TEST_RECOVERY_FIXTURE_REQUIRED';end if;
 before_asset:=public.content_pipeline_visual_recovery_v1(i.pipeline_image_id);
 j:=(before_asset->>'jobId')::uuid;
 select pipeline_image_run_id into v_run from public."23_content_pipeline_image_run"
 where pipeline_image_id=i.pipeline_image_id order by pipeline_image_run_id desc limit 1;
 if v_run is null then raise exception 'TEST_RUN_FIXTURE_REQUIRED';end if;
 update public."21_content_pipeline_image" set status='PROCESSING',handoff_phase='PRODUCING',
 claimed_by=w,claim_token=tok,claim_expires_at=now()+interval '30 minutes' where pipeline_image_id=i.pipeline_image_id;
 update public."23_content_pipeline_image_run" set status='RUNNING',claim_token=tok,worker_key=w
 where pipeline_image_run_id=v_run;
 receipt:=jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineId',i.pipeline_id,
 'pipelineImageRunId',v_run,'claimToken',tok,'generationContractHash',i.generation_contract_hash);
 insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,target_image_id,pipeline_image_id,response,created_at)
 values(w,owner_id,i.pipeline_image_id,i.pipeline_image_id,receipt,now()-interval '2 seconds'),
       (w,alias_id,i.pipeline_image_id,i.pipeline_image_id,receipt,now()-interval '1 second');
 c:=public.content_pipeline_visual_claim_request_status_v1(w,owner_id);
 if c->>'activeClaim' is distinct from 'true' or c->'recoverableStaging'->>'sha256' is distinct from before_asset->>'sha256'
 then raise exception 'TEST_OWNER_OR_RECOVERY_FAILED';end if;
 c:=public.content_pipeline_visual_claim_request_status_v1(w,alias_id);
 if c->>'activeClaim' is distinct from 'false' or c->>'result'<>'CLAIM_NOT_OWNED' or c->'claim' ? 'claimToken'
 then raise exception 'TEST_ALIAS_FENCE_FAILED';end if;
 c:=public.content_pipeline_claim_visual_request_v1(w,other_id,i.pipeline_image_id);
 if c->>'result'<>'BUSY' or c->>'activeClaim' is distinct from 'false' then raise exception 'TEST_NEW_REQUEST_RESUMED_OWNER';end if;
 c:=public.content_pipeline_claim_visual_request_v1(w,owner_id,i.pipeline_image_id);
 if c->>'activeClaim' is distinct from 'true' or c->>'replayed' is distinct from 'true' then raise exception 'TEST_OWNER_REPLAY_FAILED';end if;
 begin
   perform public.content_pipeline_fail_visual_request_v1(w,alias_id,'RETRY','TEST','TEST','must not close');
   raise exception 'TEST_ALIAS_CLOSED_OWNER';
 exception when others then if sqlerrm<>'ACTIVE_VISUAL_CLAIM_REQUIRED' then raise;end if;end;
 begin
   perform public.content_pipeline_approve_visual_request_v1(w,alias_id,j,before_asset->>'sha256','{}'::jsonb);
   raise exception 'TEST_ALIAS_APPROVED_OWNER';
 exception when others then if sqlerrm<>'ACTIVE_VISUAL_CLAIM_REQUIRED' then raise;end if;end;
 c:=public.content_pipeline_fail_visual_request_v1(w,owner_id,'RETRY','INSPECTION','TEST_PIXELS','regression test only');
 if c->>'activeClaim' is distinct from 'false' or c->>'status'<>'RETRY'
   or c->'recoverableStaging'->>'sha256' is distinct from before_asset->>'sha256'
   or c->>'failureCode'<>'TEST_PIXELS' then raise exception 'TEST_RETRY_RECOVERY_FAILED';end if;
 if not exists(select 1 from public."23_content_pipeline_image_run" where pipeline_image_run_id=v_run
   and metadata->'recoverableStaging'->>'jobId'=j::text) then raise exception 'TEST_RUN_RECOVERY_NOT_PERSISTED';end if;
 -- An old approved job returned to production must never be advertised again.
 update public."27_content_pipeline_source_stage_job" set approved_at=now() where job_id=j;
 update public."21_content_pipeline_image" set staging_asset=null where pipeline_image_id=i.pipeline_image_id;
 c:=public.content_pipeline_visual_recovery_v1(i.pipeline_image_id);
 if c->>'jobId'=j::text then raise exception 'TEST_REJECTED_APPROVED_CANDIDATE_REUSED';end if;
 if has_function_privilege('anon','public.content_pipeline_visual_recovery_v1(bigint)','EXECUTE')
   or has_function_privilege('authenticated','public.content_pipeline_fail_visual_request_v1(text,uuid,text,text,text,text)','EXECUTE')
   or has_function_privilege('anon','public.content_pipeline_approve_visual_request_v1(text,uuid,uuid,text,jsonb)','EXECUTE')
 then raise exception 'TEST_RPC_PUBLIC_ACCESS';end if;
end $test$;

select 'PASS' as visual_recovery_regression;
rollback;
