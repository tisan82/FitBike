create or replace function public.content_pipeline_reclaim_image_v1(p_pipeline_image_id bigint, p_worker_key text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare i public."21_content_pipeline_image"%rowtype;p public."18_content_pipeline"%rowtype;v_token uuid:=extensions.gen_random_uuid();v_run bigint;v_contract jsonb;v_hash text;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_WORKER_KEY';end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_IMAGE_NOT_FOUND';end if;
 if i.status='PROCESSING' and i.claim_expires_at>=now() then raise exception using errcode='55000',message='CONTENT_PIPELINE_IMAGE_ALREADY_CLAIMED';end if;
 if i.status not in('PENDING','RETRY','PROCESSING','DONE') then raise exception using errcode='55000',message='CONTENT_PIPELINE_IMAGE_NOT_RECLAIMABLE';end if;
 if i.status='PROCESSING' and i.claim_token is not null then
   update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_REPLACED',error='Explicit image reclaim replaced prior claim.'
   where pipeline_image_id=i.pipeline_image_id and claim_token=i.claim_token and status='RUNNING';
 end if;
 v_contract:=public.content_pipeline_build_image_generation_contract_v1(i.pipeline_image_id);
 v_hash:=encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex');
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id;
 update public."21_content_pipeline_image"
 set status='PROCESSING',handoff_phase='PRODUCING',staging_asset=null,staging_input=null,upload_request_id=null,upload_dispatched_at=null,
     generation_status='NOT_STARTED',qa_status='NOT_STARTED',file_status='NOT_STARTED',upload_status='NOT_STARTED',
     storage_bucket=null,storage_path=null,sha256=null,completed_at=null,
     claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval '60 minutes',
     attempt_count=attempt_count+1,generation_contract=v_contract,generation_contract_hash=v_hash,next_eligible_at=null,
     failure_stage=null,failure_code=null,last_error=null,retry_action='REPLACE_SOURCE',updated_at=now()
 where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata)
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',
 jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract,'claimMode','EXPLICIT_RECLAIM','claimTtlMinutes',60,'replacementSourceRequired',true))
 returning pipeline_image_run_id into v_run;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'claimExpiresAt',i.claim_expires_at);
end $function$;
