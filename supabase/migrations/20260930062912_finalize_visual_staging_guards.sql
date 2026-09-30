CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_producer_v1(p_worker_key text, p_pipeline_image_id bigint default null)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  i public."21_content_pipeline_image"%rowtype;
  p public."18_content_pipeline"%rowtype;
  v_target_pipeline_id bigint;
  v_token uuid:=extensions.gen_random_uuid();
  v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_WORKER_KEY'; end if;
 for p in select p0.* from public."18_content_pipeline" p0 join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id where p0.ownership_state='CLAIMED' and p0.stage='DRAFTED' order by t0.priority,t0.content_topic_id,p0.pipeline_id loop
   begin
     perform public.content_pipeline_sync_images_v1(p.pipeline_id);
   exception when others then
     continue;
   end;
 end loop;
 select p0.pipeline_id into v_target_pipeline_id from public."18_content_pipeline" p0 join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL') and (p_pipeline_image_id is null or p0.pipeline_id=(select pipeline_id from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id)) and exists(select 1 from public."21_content_pipeline_image" ix where ix.pipeline_id=p0.pipeline_id and ix.status not in ('DONE','CANCELLED')) order by t0.priority,t0.content_topic_id,p0.pipeline_id limit 1;
 if v_target_pipeline_id is null then return null; end if;
 select i0.* into i from public."21_content_pipeline_image" i0 where i0.pipeline_id=v_target_pipeline_id and (p_pipeline_image_id is null or i0.pipeline_image_id=p_pipeline_image_id) and i0.status not in ('DONE','CANCELLED','READY_FOR_UPLOAD') and i0.staging_asset is null order by i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 if i.status='PROCESSING' and i.claim_expires_at>=now() then return null; end if;
 if i.status='RETRY' and coalesce(i.next_eligible_at,'-infinity'::timestamptz)>now() then return null; end if;
 if i.status not in ('PENDING','RETRY','PROCESSING') then return null; end if;
 v_old_token:=i.claim_token;
 if i.status='PROCESSING' and i.claim_expires_at<now() and v_old_token is not null then
   update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_EXPIRED',error='Image claim TTL expired before Complete/Fail RPC.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reclaimedAt',now()) where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status='RUNNING';
 end if;
 v_contract:=public.content_pipeline_build_image_generation_contract_v1(i.pipeline_image_id);
 v_hash:=encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex');
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage='DRAFTED';
 update public."21_content_pipeline_image" set status='PROCESSING',handoff_phase='PRODUCING',upload_request_id=null,upload_dispatched_at=null,claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval '60 minutes',attempt_count=attempt_count+1,generation_contract=v_contract,generation_contract_hash=v_hash,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now() where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata) values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract,'claimOrder','TOPIC_PRIORITY_THEN_IMAGE_ORDINAL','claimTtlMinutes',60)) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then
   update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes'
   where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null;
 end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end $function$
;

