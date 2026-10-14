begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $test$
declare i public."21_content_pipeline_image"%rowtype;j public."27_content_pipeline_source_stage_job"%rowtype;
 w text:='candidate-gate-test-'||extensions.gen_random_uuid();req uuid:=extensions.gen_random_uuid();review_req uuid:=extensions.gen_random_uuid();c jsonb;z jsonb;ev jsonb;
begin
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."27_content_pipeline_source_stage_job" j0 on j0.pipeline_image_id=i0.pipeline_image_id
 where i0.status in ('PENDING','RETRY','READY_FOR_UPLOAD') and (i0.claim_token is null or i0.claim_expires_at<now())
 and public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,j0.job_id) is not null
 and not exists(select 1 from public."27_content_pipeline_source_stage_job" running where running.pipeline_image_id=i0.pipeline_image_id and running.status in ('PENDING','RUNNING'))
 order by i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then raise exception 'QA_GATE_IDLE_FIXTURE_REQUIRED';end if;
 select * into j from public."27_content_pipeline_source_stage_job" where pipeline_image_id=i.pipeline_image_id
 and public.content_pipeline_review_candidate_v1(i.pipeline_image_id,job_id) is not null order by created_at desc limit 1 for update;
 -- Only transaction-local identity metadata changes. No file, HTTP dispatch, generation or approval.
 update public."27_content_pipeline_source_stage_job" set spec=(spec-'composition'-'inputAssetUrl')||jsonb_build_object(
  'preflightOnly',true,'sourceAssetUrl','https://example.invalid/'||extensions.gen_random_uuid()::text,
  'visualMcpOperation',jsonb_build_object('workerKey',w)),
  result=result||jsonb_build_object('preflightOnly',true,'preStagingSourceSha256',encode(extensions.digest(extensions.gen_random_uuid()::text,'sha256'),'hex'))
 where job_id=j.job_id;
 update public."21_content_pipeline_image" set status='PENDING',staging_asset=null,visual_phase='PRODUCTION_PENDING',review_candidate=null,
  claimed_by=null,claim_token=null,claim_expires_at=null,next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 c:=public.content_pipeline_claim_visual_delivery_v1(w,req,'PRODUCER',i.pipeline_image_id,'SCHEDULED');
 if c->>'activeClaim' is distinct from 'true' or c->'claim'->>'deliveryRuntime' is distinct from 'SCHEDULED'
  or c->'claim'->'environmentObservation'->>'ready' is distinct from 'false'
  or c->'claim'->>'environmentProbeRequired' is distinct from 'false' then raise exception 'QA_GATE_UNKNOWN_ENVIRONMENT_CLAIM_FAILED';end if;
 begin perform public.content_pipeline_claim_visual_delivery_v1(w,req,'PRODUCER',i.pipeline_image_id,'CHAT');raise exception 'QA_GATE_RUNTIME_REPLAY_ACCEPTED';
 exception when others then if sqlerrm not like 'VISUAL_REQUEST_INPUT_CONFLICT%' then raise;end if;end;
 begin perform public.content_pipeline_handoff_visual_review_v1(w,req,j.job_id,j.result->>'sha256');raise exception 'QA_GATE_UNINSPECTED_HANDOFF_ALLOWED';
 exception when others then if sqlerrm not like 'CLIENT_PIXEL_INSPECTION_REQUIRED%' then raise;end if;end;
 ev:=jsonb_build_object('eventId',extensions.gen_random_uuid(),'requestId',req,'jobId',j.job_id,'runtime','SCHEDULED','scope','CANDIDATE',
  'stage','PIXELS_INSPECTED','outcome','PASS','code','PASS','view','CANONICAL','expectedSha',j.result->>'sha256',
  'pixelsInspected',true,'pixelQa','PASS','evidence','Rollback-only protocol fixture; this is not actual scheduled pixel inspection proof.');
 perform public.content_pipeline_record_visual_delivery_v1(w,ev,false);
 begin perform public.content_pipeline_handoff_visual_review_v1(w,req,j.job_id,j.result->>'sha256');raise exception 'QA_GATE_SINGLE_VIEW_HANDOFF_ALLOWED';
 exception when others then if sqlerrm not like 'CLIENT_PIXEL_INSPECTION_REQUIRED%' then raise;end if;end;
 perform public.content_pipeline_record_visual_delivery_v1(w,ev||jsonb_build_object('eventId',extensions.gen_random_uuid(),'view','MOBILE390'),false);
 z:=public.content_pipeline_handoff_visual_review_v1(w,req,j.job_id,j.result->>'sha256');
 if z->>'handoffCompleted' is distinct from 'true' or z->>'activeClaim' is distinct from 'false' or z->>'visualPhase' is distinct from 'QA_PENDING' then raise exception 'QA_GATE_POSITIVE_HANDOFF_FAILED';end if;
 -- Historical completion replay must not re-open or require a later lease's reports.
 z:=public.content_pipeline_handoff_visual_review_v1(w,req,j.job_id,j.result->>'sha256');
 if z->>'replayed' is distinct from 'true' then raise exception 'QA_GATE_HANDOFF_REPLAY_CHANGED';end if;
 c:=public.content_pipeline_claim_visual_delivery_v1(w,review_req,'REVIEWER',i.pipeline_image_id,'SCHEDULED');
 if c->>'activeClaim' is distinct from 'true' then raise exception 'QA_GATE_REVIEW_CLAIM_FAILED';end if;
 begin perform public.content_pipeline_approve_visual_request_v1(w,review_req,j.job_id,j.result->>'sha256','{}');raise exception 'QA_GATE_OLD_CLAIM_APPROVAL_ALLOWED';
 exception when others then if sqlerrm not like 'CLIENT_PIXEL_INSPECTION_REQUIRED%' then raise;end if;end;
 ev:=ev||jsonb_build_object('eventId',extensions.gen_random_uuid(),'requestId',review_req);
 perform public.content_pipeline_record_visual_delivery_v1(w,ev,false);
 perform public.content_pipeline_record_visual_delivery_v1(w,ev||jsonb_build_object('eventId',extensions.gen_random_uuid(),'view','MOBILE390'),false);
 perform public.content_pipeline_record_visual_delivery_v1(w,ev||jsonb_build_object('eventId',extensions.gen_random_uuid(),'pixelQa','FAIL'),false);
 begin perform public.content_pipeline_approve_visual_request_v1(w,review_req,j.job_id,j.result->>'sha256','{}');raise exception 'QA_GATE_LATEST_FAIL_APPROVAL_ALLOWED';
 exception when others then if sqlerrm not like 'CLIENT_PIXEL_INSPECTION_REQUIRED%' then raise;end if;end;
 if has_function_privilege('anon','public.content_pipeline_claim_visual_delivery_v1(text,uuid,text,bigint,text)','EXECUTE')
  or has_function_privilege('authenticated','public.content_pipeline_approve_visual_request_v1(text,uuid,uuid,text,jsonb)','EXECUTE') then raise exception 'QA_GATE_PUBLIC_GRANT';end if;
end $test$;
select 'CANDIDATE_QA_GATE_REGRESSION_PASS' result;
rollback;
