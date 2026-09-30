CREATE OR REPLACE FUNCTION public.content_pipeline_fail_image_v1(p_pipeline_image_id bigint, p_pipeline_image_run_id bigint, p_claim_token uuid, p_failure_status text, p_failure_stage text, p_failure_code text, p_error text, p_retry_action text DEFAULT NULL::text, p_generation_status text DEFAULT NULL::text, p_qa_status text DEFAULT NULL::text, p_file_status text DEFAULT NULL::text, p_upload_status text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public."21_content_pipeline_image"%rowtype; v_status text; v_mismatch int; v_next timestamptz;
begin
 if p_failure_status not in ('RETRY','HOLD','BLOCKED','FAILED') then
   raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_IMAGE_FAILURE_STATUS';
 end if;
 v_status:=case when p_failure_status='FAILED' then 'RETRY' else p_failure_status end;

 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_IMAGE_NOT_FOUND'; end if;
 if i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token then
   raise exception using errcode='40001',message='CONTENT_PIPELINE_IMAGE_CLAIM_CONFLICT';
 end if;

 v_mismatch:=case when p_failure_code='BRIEF_MISMATCH' then i.brief_mismatch_count+1 else 0 end;
 v_next:=case
   when p_failure_code='BRIEF_MISMATCH' and v_mismatch>=2 then now()+interval '60 minutes'
   when v_status='RETRY' then now()+interval '5 minutes'
   else null
 end;

 update public."21_content_pipeline_image"
 set status=v_status,retry_action=p_retry_action,
   handoff_phase=case when i.handoff_phase='RETURN_TO_IMAGE_PRODUCTION' then 'RETURN_TO_IMAGE_PRODUCTION' else null end,
   generation_status=coalesce(p_generation_status,generation_status),
   qa_status=coalesce(p_qa_status,qa_status),file_status=coalesce(p_file_status,file_status),
   upload_status=coalesce(p_upload_status,upload_status),
   brief_mismatch_count=v_mismatch,next_eligible_at=v_next,
   failure_stage=p_failure_stage,failure_code=p_failure_code,last_error=left(p_error,2000),
   claimed_by=null,claim_token=null,claimed_at=null,claim_expires_at=null,updated_at=now()
 where pipeline_image_id=p_pipeline_image_id returning * into i;

 update public."23_content_pipeline_image_run"
 set status=case when p_failure_status='FAILED' then 'FAILED' else p_failure_status end,
   completed_at=now(),failure_stage=p_failure_stage,failure_code=p_failure_code,error=left(p_error,2000),
   metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb)||
     jsonb_build_object('briefMismatchCount',v_mismatch,'nextEligibleAt',v_next)
 where pipeline_image_run_id=p_pipeline_image_run_id and pipeline_image_id=p_pipeline_image_id
   and claim_token=p_claim_token and status='RUNNING';

 update public."18_content_pipeline" set stage='VISUAL',updated_at=now()
 where pipeline_id=i.pipeline_id and ownership_state='CLAIMED' and stage in ('DRAFTED','VISUAL');

 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineId',i.pipeline_id,
   'status',i.status,'retryAction',i.retry_action,'failureStage',i.failure_stage,
   'failureCode',i.failure_code,'briefMismatchCount',i.brief_mismatch_count,'nextEligibleAt',i.next_eligible_at);
end $function$;

-- A terminal failure has no active worker phase. Preserve explicit producer-return routing.
update public."21_content_pipeline_image" set handoff_phase=null
where status in ('RETRY','HOLD','BLOCKED','FAILED') and claim_token is null
and handoff_phase in ('PRODUCING','STAGING','UPLOADING','VERIFYING');
