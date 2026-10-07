begin;
do $test$
declare i public."21_content_pipeline_image"%rowtype;tok uuid:=extensions.gen_random_uuid();run_id bigint;x jsonb;
begin
 select * into i from public."21_content_pipeline_image" where status='RETRY' and claim_token is null for update skip locked limit 1;
 if not found then raise exception 'RETRY_FIXTURE_REQUIRED';end if;
 update public."21_content_pipeline_image" set status='PROCESSING',claim_token=tok,claim_expires_at=now()+interval '1 hour',claimed_by='backoff-regression',brief_mismatch_count=0 where pipeline_image_id=i.pipeline_image_id;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status) values(i.pipeline_image_id,i.pipeline_id,tok,'backoff-regression',i.attempt_count+1,'RUNNING') returning pipeline_image_run_id into run_id;
 x:=public.content_pipeline_fail_image_v1(i.pipeline_image_id,run_id,tok,'RETRY','TEST','TECHNICAL','rollback fixture');
 if (x->>'nextEligibleAt')::timestamptz<>now()+interval '3 minutes' then raise exception 'ORDINARY_BACKOFF_NOT_THREE_MINUTES';end if;
 update public."21_content_pipeline_image" set status='PROCESSING',claim_token=tok,brief_mismatch_count=1 where pipeline_image_id=i.pipeline_image_id;
 update public."23_content_pipeline_image_run" set status='RUNNING' where pipeline_image_run_id=run_id;
 x:=public.content_pipeline_fail_image_v1(i.pipeline_image_id,run_id,tok,'RETRY','TEST','BRIEF_MISMATCH','rollback fixture');
 if (x->>'nextEligibleAt')::timestamptz<>now()+interval '3 minutes' or x->>'briefMismatchCount'<>'2' then raise exception 'REPEATED_MISMATCH_NOT_THREE_MINUTES';end if;
 if exists(select 1 from public."21_content_pipeline_image" where pipeline_image_id=i.pipeline_image_id and (claim_token is not null or claim_expires_at is not null)) then raise exception 'FAIL_DID_NOT_RELEASE';end if;
 update public."21_content_pipeline_image" set status='PROCESSING',claim_token=tok where pipeline_image_id=i.pipeline_image_id;
 x:=public.content_pipeline_fail_image_v1(i.pipeline_image_id,run_id,tok,'HOLD','TEST','MANUAL_HOLD','rollback fixture');
 if x->>'nextEligibleAt' is not null then raise exception 'HOLD_AUTORETRY_ENABLED';end if;
end $test$;

rollback;
