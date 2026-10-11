begin;
do $test$
declare
 w text:='delivery-regression-'||extensions.gen_random_uuid(); probe uuid:=extensions.gen_random_uuid(); probe2 uuid:=extensions.gen_random_uuid(); event uuid:=extensions.gen_random_uuid(); request uuid:=extensions.gen_random_uuid(); job uuid:=extensions.gen_random_uuid(); x jsonb; payload jsonb; i public."21_content_pipeline_image"%rowtype; j public."27_content_pipeline_source_stage_job"%rowtype; n integer; first_sha text;
begin
 if has_table_privilege('anon','public.content_pipeline_visual_delivery_event','SELECT') or has_table_privilege('authenticated','public.content_pipeline_visual_delivery_event','INSERT') or has_function_privilege('anon','public.content_pipeline_record_visual_delivery_v1(text,jsonb,boolean)','EXECUTE') then raise exception 'DELIVERY_PUBLIC_ACCESS'; end if;
 x:=public.content_pipeline_visual_delivery_health_v1(w,'WORK'); if x->>'ready'<>'false' then raise exception 'UNOBSERVED_RUNTIME_READY'; end if;
 payload:=jsonb_build_object('eventId',probe,'probeId',probe,'runtime','WORK','scope','ENVIRONMENT','stage','SERVER_IMAGE_BLOCKS','outcome','PASS','code','PASS','expectedSha',repeat('a',64));
 perform public.content_pipeline_record_visual_delivery_v1(w,payload,true);
 payload:=payload||jsonb_build_object('eventId',extensions.gen_random_uuid(),'stage','CLIENT_IMAGE_OUTPUT','outcome','FAIL','code','CLIENT_PIXEL_RENDER_UNVERIFIED');
 perform public.content_pipeline_record_visual_delivery_v1(w,payload,false);
 perform public.content_pipeline_record_visual_delivery_v1(w,jsonb_build_object('eventId',probe2,'probeId',probe2,'runtime','WORK','scope','ENVIRONMENT','stage','SERVER_IMAGE_BLOCKS','outcome','PASS','code','PASS','expectedSha',repeat('a',64)),true);
 perform public.content_pipeline_record_visual_delivery_v1(w,payload||jsonb_build_object('eventId',extensions.gen_random_uuid(),'probeId',probe2),false);
 x:=public.content_pipeline_visual_delivery_health_v1(w,'WORK'); if x->>'state'<>'OPEN' or x->>'ready'<>'false' then raise exception 'ENVIRONMENT_CIRCUIT_NOT_OPEN'; end if;
 if public.content_pipeline_visual_delivery_health_v1(w||'-other','WORK')->>'state'<>'UNVERIFIED' then raise exception 'CROSS_WORKER_CIRCUIT'; end if;
 payload:=jsonb_build_object('eventId',event,'probeId',probe2,'runtime','WORK','scope','ENVIRONMENT','stage','PIXELS_INSPECTED','outcome','PASS','code','PASS','expectedSha',repeat('a',64),'pixelsInspected',true,'evidence','Actual probe pixels inspected: three distinct vertical color bands.');
 perform public.content_pipeline_record_visual_delivery_v1(w,payload,false);
 if public.content_pipeline_visual_delivery_health_v1(w,'WORK')->>'ready'<>'true' or public.content_pipeline_visual_delivery_health_v1(w,'SCHEDULED')->>'ready'<>'false' then raise exception 'RUNTIME_READINESS_NOT_SEPARATE'; end if;
 update public.content_pipeline_visual_delivery_event set created_at=now()-interval '40 minutes' where event_id=probe2;
 perform public.content_pipeline_record_visual_delivery_v1(w,payload,false); -- exact replay survives issued probe expiry
 begin perform public.content_pipeline_record_visual_delivery_v1(w,payload||jsonb_build_object('outcome','FAIL','code','TRANSPORT_ERROR'),false); raise exception 'CHANGED_EVENT_REPLAY_ALLOWED'; exception when others then if sqlerrm<>'DELIVERY_EVENT_IMMUTABLE' then raise;end if;end;
 begin perform public.content_pipeline_claim_visual_delivery_v1(w,request,'PRODUCER',null,'SCHEDULED'); raise exception 'UNVERIFIED_RUNTIME_CLAIMED'; exception when others then if sqlerrm<>'PIXEL_DELIVERY_PRECHECK_BLOCKED' then raise;end if;end;
 if exists(select 1 from public."29_content_pipeline_visual_claim_request" where worker_key=w and request_id=request) then raise exception 'PRECHECK_CREATED_RECEIPT';end if;
 select i0.* into i from public."21_content_pipeline_image" i0 join public."27_content_pipeline_source_stage_job" j0 on j0.pipeline_image_id=i0.pipeline_image_id where public.content_pipeline_review_candidate_v1(i0.pipeline_image_id,j0.job_id) is not null and not(i0.status='PROCESSING' and i0.claim_expires_at>=now()) order by j0.created_at desc limit 1;
 if not found then raise exception 'VALID_STORED_FIXTURE_REQUIRED';end if;
 select j0.* into j from public."27_content_pipeline_source_stage_job" j0 where public.content_pipeline_review_candidate_v1(i.pipeline_image_id,j0.job_id) is not null order by created_at desc limit 1;
 first_sha:=j.result->>'sha256';
 update public."21_content_pipeline_image" set status='PENDING',staging_asset=null,review_candidate=null,visual_phase=null,claimed_by=null,claim_token=null,claim_expires_at=null,next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 x:=public.content_pipeline_claim_visual_delivery_v1(w,request,'PRODUCER',i.pipeline_image_id,'WORK');
 if x->>'activeClaim'<>'true' or x->'claim'->>'deliveryRuntime'<>'WORK' then raise exception 'GATED_CLAIM_FAILED';end if;
 insert into public."27_content_pipeline_source_stage_job"(job_id,pipeline_image_id,claim_token,contract_hash,spec,status,token_hash,result) values(job,i.pipeline_image_id,(x->'claim'->>'claimToken')::uuid,j.contract_hash,j.spec||jsonb_build_object('visualMcpOperation',jsonb_build_object('workerKey',w,'requestId',request,'operationId',extensions.gen_random_uuid())),'STAGED',extensions.digest('delivery-regression','sha256'),j.result);
 payload:=jsonb_build_object('eventId',extensions.gen_random_uuid(),'requestId',request,'jobId',job,'runtime','WORK','scope','CANDIDATE','stage','PIXELS_INSPECTED','outcome','PASS','code','PASS','view','CANONICAL','expectedSha',first_sha,'pixelsInspected',true,'pixelQa','PASS','evidence','Fixture operator actual canonical inspection only; transaction will roll back.');
 perform public.content_pipeline_record_visual_delivery_v1(w,payload,false);
 perform public.content_pipeline_record_visual_delivery_v1(w,payload||jsonb_build_object('eventId',extensions.gen_random_uuid(),'view','MOBILE390'),false);
 perform public.content_pipeline_require_visual_pixel_report_v1(w,request,job,first_sha,'WORK');
 perform public.content_pipeline_record_visual_delivery_v1(w,payload||jsonb_build_object('eventId',extensions.gen_random_uuid(),'pixelQa','FAIL'),false);
 begin perform public.content_pipeline_require_visual_pixel_report_v1(w,request,job,first_sha,'WORK');raise exception 'STALE_PIXEL_PASS_ALLOWED';exception when others then if sqlerrm<>'CLIENT_PIXEL_INSPECTION_REQUIRED' then raise;end if;end;
 perform public.content_pipeline_record_visual_delivery_v1(w,payload||jsonb_build_object('eventId',extensions.gen_random_uuid()),false);
 perform public.content_pipeline_require_visual_pixel_report_v1(w,request,job,first_sha,'WORK');
 begin perform public.content_pipeline_record_visual_delivery_v1(w||'-other',payload||jsonb_build_object('eventId',extensions.gen_random_uuid()),false);raise exception 'FOREIGN_RECEIPT_ALLOWED';exception when others then if sqlerrm<>'VISUAL_CLAIM_RECEIPT_REQUIRED' then raise;end if;end;
 -- No remote request is dispatched. Repeated transport failures retain the same stored candidate.
 for n in 1..3 loop
   if n>1 then
     request:=extensions.gen_random_uuid();
     update public."21_content_pipeline_image" set next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
     x:=public.content_pipeline_claim_visual_stage_v1(w,request,'PRODUCER',i.pipeline_image_id);
   end if;
   payload:=jsonb_build_object('eventId',extensions.gen_random_uuid(),'requestId',request,'jobId',job,'runtime','WORK','scope','CANDIDATE','stage','CLIENT_IMAGE_OUTPUT','outcome','FAIL','code','CLIENT_PIXEL_RENDER_UNVERIFIED','view','CANONICAL','expectedSha',first_sha);
   perform public.content_pipeline_record_visual_delivery_v1(w,payload,false);
   perform public.content_pipeline_fail_visual_request_v1(w,request,'RETRY','PRODUCTION_PIXEL_INSPECTION','CLIENT_PIXEL_RENDER_UNVERIFIED','Transactional delivery failure fixture');
   x:=public.content_pipeline_visual_delivery_backoff_v1(w,request);
 end loop;
 if x->>'candidateCircuit'<>'OPEN' or not exists(select 1 from public."21_content_pipeline_image" where pipeline_image_id=i.pipeline_image_id and next_eligible_at>now()+interval '29 minutes') then raise exception 'CANDIDATE_CIRCUIT_NOT_OPEN';end if;
 -- Runtime-specific candidate failures must not poison another runtime.
 request:=extensions.gen_random_uuid();update public."21_content_pipeline_image" set next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 x:=public.content_pipeline_claim_visual_stage_v1(w,request,'PRODUCER',i.pipeline_image_id);
 perform public.content_pipeline_record_visual_delivery_v1(w,payload||jsonb_build_object('eventId',extensions.gen_random_uuid(),'requestId',request,'runtime','SCHEDULED'),false);
 perform public.content_pipeline_fail_visual_request_v1(w,request,'RETRY','PRODUCTION_PIXEL_INSPECTION','CLIENT_PIXEL_RENDER_UNVERIFIED','Transactional other-runtime fixture');
 if public.content_pipeline_visual_delivery_backoff_v1(w,request)->>'candidateCircuit'<>'CLOSED' then raise exception 'WORK_FAILURES_POISONED_SCHEDULED_CANDIDATE';end if;
 -- A distinct new SHA cannot inherit the old candidate failure group.
 request:=extensions.gen_random_uuid();update public."21_content_pipeline_image" set next_eligible_at=null where pipeline_image_id=i.pipeline_image_id;
 x:=public.content_pipeline_claim_visual_stage_v1(w,request,'PRODUCER',i.pipeline_image_id);
 update public."27_content_pipeline_source_stage_job" set result=result||jsonb_build_object('sha256',repeat('b',64)) where job_id=job;
 perform public.content_pipeline_record_visual_delivery_v1(w,payload||jsonb_build_object('eventId',extensions.gen_random_uuid(),'requestId',request,'expectedSha',repeat('b',64)),false);
 perform public.content_pipeline_fail_visual_request_v1(w,request,'RETRY','PRODUCTION_PIXEL_INSPECTION','CLIENT_PIXEL_RENDER_UNVERIFIED','Transactional new-SHA failure fixture');
 if public.content_pipeline_visual_delivery_backoff_v1(w,request)->>'candidateCircuit'<>'CLOSED' then raise exception 'OLD_SHA_BLOCKED_NEW_CANDIDATE';end if;
 if public.content_pipeline_visual_delivery_health_v1(w,'WORK')->>'ready'<>'true' then raise exception 'CANDIDATE_FAILURE_POISONED_ENVIRONMENT';end if;
end $test$;
select 'VISUAL_DELIVERY_REGRESSION_PASS' as result;
rollback;
