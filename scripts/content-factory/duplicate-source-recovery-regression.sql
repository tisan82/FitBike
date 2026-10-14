begin;
do $test$
declare i public."21_content_pipeline_image"%rowtype; j public."27_content_pipeline_source_stage_job"%rowtype;
 w text; req uuid; x jsonb; z jsonb; original_result jsonb; original_hash text; other_id bigint;
begin
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."27_content_pipeline_source_stage_job" j0 on j0.pipeline_image_id=i0.pipeline_image_id
 where i0.status in ('PENDING','RETRY','READY_FOR_UPLOAD')
 and j0.spec->>'preflightOnly'='true'
 and (i0.claim_token is null or i0.claim_expires_at<now())
 and public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,j0.job_id) is not null

 order by i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then raise exception 'DUPLICATE_IDLE_CANDIDATE_FIXTURE_REQUIRED';end if;
 select * into j from public."27_content_pipeline_source_stage_job" where pipeline_image_id=i.pipeline_image_id and spec->>'preflightOnly'='true' and public.content_pipeline_review_candidate_v1(i.pipeline_image_id,job_id) is not null order by created_at desc limit 1;
 select pipeline_image_id into other_id from public."21_content_pipeline_image" where pipeline_image_id<>i.pipeline_image_id and status='DONE' order by pipeline_image_id limit 1 for update skip locked;
 if other_id is null then raise exception 'APPROVED_IDENTITY_FIXTURE_REQUIRED';end if;
 -- Seed source identity only inside this transaction, including Native fixtures and legacy DONE rows without staging metadata.
 j.spec:=(j.spec-'composition'-'inputAssetUrl')||jsonb_build_object('sourceAssetUrl','https://example.invalid/duplicate-regression-'||extensions.gen_random_uuid()::text);
 update public."27_content_pipeline_source_stage_job" set spec=j.spec where job_id=j.job_id;
 update public."21_content_pipeline_image" set staging_asset=coalesce(staging_asset,'{}'::jsonb)||jsonb_build_object(
  'qa',coalesce(staging_asset->'qa','{}'::jsonb)||jsonb_build_object('sourceAssetUrl',j.spec->>'sourceAssetUrl')) where pipeline_image_id=other_id;
 if public.content_pipeline_duplicate_source_id_v1(i.pipeline_image_id,j.spec) is null then raise exception 'DUPLICATE_FIXTURE_NOT_SEEDED';end if;
 update public."21_content_pipeline_image" set status='PENDING',staging_asset=null,visual_phase='QA_PENDING',review_candidate=public.content_pipeline_review_candidate_v1(i.pipeline_image_id,j.job_id),claimed_by=null,claim_token=null,claim_expires_at=null,next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 w:=j.spec->'visualMcpOperation'->>'workerKey'; original_result:=j.result; original_hash:=i.generation_contract_hash;
 begin
   update public."21_content_pipeline_image" set next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
   req:=extensions.gen_random_uuid();
   x:=public.content_pipeline_claim_visual_stage_v1(w,req,'REVIEWER',i.pipeline_image_id);
   if x->>'activeClaim' is distinct from 'true' then raise exception 'DUPLICATE_REVIEW_FIXTURE_NOT_CLAIMED';end if;
   z:=public.content_pipeline_return_duplicate_visual_candidate_v1(w,req,j.job_id,j.result->>'sha256');
   if z->>'activeClaim' is distinct from 'false' or z->>'visualPhase' is distinct from 'PRODUCTION_PENDING' then raise exception 'DUPLICATE_RETURN_NOT_CLOSED';end if;
   if public.content_pipeline_owned_visual_candidate_v1(w,i.pipeline_image_id) is not null then raise exception 'DUPLICATE_RECOVERED_AGAIN';end if;
   if (select result->>'sha256' from public."27_content_pipeline_source_stage_job" where job_id=j.job_id) is distinct from original_result->>'sha256'
    or (select result->'preStagingQa' from public."27_content_pipeline_source_stage_job" where job_id=j.job_id) is distinct from original_result->'preStagingQa'
    or (select generation_contract_hash from public."21_content_pipeline_image" where pipeline_image_id=i.pipeline_image_id) is distinct from original_hash then raise exception 'DUPLICATE_ASSET_OR_QA_CHANGED';end if;
   if not exists(select 1 from public."23_content_pipeline_image_run" where pipeline_image_run_id=(x->'claim'->>'pipelineImageRunId')::bigint and metadata->'rejectedCandidate'->>'jobId'=j.job_id::text) then raise exception 'DUPLICATE_AUDIT_MISSING';end if;
   begin
     perform public.content_pipeline_return_duplicate_visual_candidate_v1(w,req,j.job_id,j.result->>'sha256');
     raise exception 'INACTIVE_DUPLICATE_REPLAY_ALLOWED';
   exception when others then if sqlerrm not like 'ACTIVE_VISUAL_CLAIM_REQUIRED%' then raise;end if;end;
   raise exception using errcode='ZX001',message='REVIEW_CASE_ROLLBACK';
 exception when sqlstate 'ZX001' then null;end;
 begin
   update public."21_content_pipeline_image" set visual_phase='PRODUCTION_PENDING',review_candidate=null,next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
   req:=extensions.gen_random_uuid();
   x:=public.content_pipeline_claim_visual_stage_v1(w,req,'PRODUCER',i.pipeline_image_id);
   if x->>'activeClaim' is distinct from 'true' then raise exception 'DUPLICATE_PRODUCER_FIXTURE_NOT_CLAIMED';end if;
   z:=public.content_pipeline_handoff_visual_review_v1(w,req,j.job_id,j.result->>'sha256');
   if z->>'handoffCompleted' is distinct from 'false' or z->>'activeClaim' is distinct from 'false' or z->>'visualPhase' is distinct from 'PRODUCTION_PENDING' then raise exception 'DUPLICATE_HANDOFF_NOT_BLOCKED';end if;
   raise exception using errcode='ZX001',message='PRODUCER_CASE_ROLLBACK';
 exception when sqlstate 'ZX001' then null;end;
 begin
   -- Independent nonduplicate handoff, still rollback-only and no HTTP dispatch.
   update public."27_content_pipeline_source_stage_job" set spec=(spec-'composition'-'inputAssetUrl')||jsonb_build_object('sourceAssetUrl','https://example.invalid/'||extensions.gen_random_uuid()::text),
    result=result||jsonb_build_object('preStagingSourceSha256',encode(extensions.digest(extensions.gen_random_uuid()::text,'sha256'),'hex')) where job_id=j.job_id;
   update public."21_content_pipeline_image" set visual_phase='PRODUCTION_PENDING',review_candidate=null,next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
   req:=extensions.gen_random_uuid();x:=public.content_pipeline_claim_visual_stage_v1(w,req,'PRODUCER',i.pipeline_image_id);
   if x->>'activeClaim' is distinct from 'true' then raise exception 'NORMAL_HANDOFF_FIXTURE_NOT_CLAIMED';end if;
   z:=public.content_pipeline_handoff_visual_review_v1(w,req,j.job_id,j.result->>'sha256');
   if z->>'handoffCompleted' is distinct from 'true' or z->>'activeClaim' is distinct from 'false' or z->>'visualPhase' is distinct from 'QA_PENDING' then raise exception 'NORMAL_HANDOFF_REGRESSION';end if;
   raise exception using errcode='ZX001',message='NORMAL_CASE_ROLLBACK';
 exception when sqlstate 'ZX001' then null;end;
 if has_function_privilege('anon','public.content_pipeline_return_duplicate_visual_candidate_v1(text,uuid,uuid,text)','EXECUTE')
   or has_function_privilege('authenticated','public.content_pipeline_duplicate_source_id_v1(bigint,jsonb,text)','EXECUTE') then raise exception 'DUPLICATE_RECOVERY_PUBLIC_GRANT';end if;
end $test$;
rollback;

