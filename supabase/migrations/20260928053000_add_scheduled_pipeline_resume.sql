-- Scheduled Content Pipeline HOLD/BLOCKED resume support.
alter table public."18_content_pipeline"
  add column if not exists resume_stage text,
  add column if not exists hold_reason text,
  add column if not exists retryable boolean;

alter table public."18_content_pipeline" drop constraint if exists "18_content_pipeline_resume_stage_check";
alter table public."18_content_pipeline" add constraint "18_content_pipeline_resume_stage_check"
check (resume_stage is null or resume_stage in ('PLANNING','RESEARCHING','WRITING','VISUAL','QA','PUBLISHING'));

create or replace function public.content_pipeline_resume_stage_v1(p_pipeline_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public."18_content_pipeline"%rowtype; r_id bigint; v_run_stage text;
begin
 select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_NOT_FOUND'; end if;
 if p.ownership_state <> 'CLAIMED' then raise exception using errcode='22023',message='CONTENT_PIPELINE_NOT_CLAIMED'; end if;
 if p.stage not in ('HOLD','BLOCKED') or p.resume_stage is null then raise exception using errcode='22023',message='CONTENT_PIPELINE_NOT_RESUMABLE'; end if;
 if exists(select 1 from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id and status='RUNNING') then
   raise exception using errcode='55000',message='CONTENT_PIPELINE_RUN_ALREADY_ACTIVE';
 end if;
 v_run_stage:=p.resume_stage;
 update public."18_content_pipeline" set stage=v_run_stage,last_error=null,hold_reason=null,retryable=null,updated_at=now()
 where pipeline_id=p_pipeline_id returning * into p;
 insert into public."19_content_pipeline_run"(pipeline_id,stage,status,metadata)
 values(p_pipeline_id,v_run_stage,'RUNNING',jsonb_build_object('resumed',true,'retryCount',p.retry_count))
 returning pipeline_run_id into r_id;
 return jsonb_build_object('pipelineId',p.pipeline_id,'pipelineRunId',r_id,'topicKey',p.topic_key,'stage',p.stage,'resumed',true,'pipeline',to_jsonb(p));
end $$;

revoke all on function public.content_pipeline_resume_stage_v1(bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_resume_stage_v1(bigint) to service_role;


create or replace function public.content_pipeline_fail_stage_v1(
 p_pipeline_id bigint,p_pipeline_run_id bigint,p_expected_stage text,p_failure_status text,p_error text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public."18_content_pipeline"%rowtype; v_reason text; v_retryable boolean;
begin
 if p_failure_status not in ('HOLD','BLOCKED') then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_FAILURE_STATUS'; end if;
 v_reason := case
   when p_error ilike '%UNSUPPORTED_EXECUTION_ENVIRONMENT%' then 'UNSUPPORTED_EXECUTION_ENVIRONMENT'
   when p_error ilike '%ASSET_PRODUCTION_REQUIRED%' then 'ASSET_PRODUCTION_REQUIRED'
   when p_error ilike '%STORAGE_UPLOAD_FAILED%' then 'STORAGE_UPLOAD_FAILED'
   when p_error ilike '%RIGHTS_NOT_CONFIRMED%' then 'RIGHTS_NOT_CONFIRMED'
   when p_error ilike '%FACT_CONFLICT%' then 'FACT_CONFLICT'
   else p_failure_status
 end;
 v_retryable := v_reason in ('ASSET_PRODUCTION_REQUIRED','STORAGE_UPLOAD_FAILED');
 update public."18_content_pipeline"
 set stage=p_failure_status,last_error=left(p_error,2000),retry_count=retry_count+1,
     resume_stage=p_expected_stage,hold_reason=v_reason,retryable=v_retryable,updated_at=now()
 where pipeline_id=p_pipeline_id and stage=p_expected_stage and ownership_state='CLAIMED'
 returning * into p;
 if not found then raise exception using errcode='40001',message='CONTENT_PIPELINE_STATE_CONFLICT'; end if;
 update public."19_content_pipeline_run"
 set status=p_failure_status,completed_at=now(),error=left(p_error,2000),
     metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('resumeStage',p_expected_stage,'holdReason',v_reason,'retryable',v_retryable)
 where pipeline_run_id=p_pipeline_run_id and pipeline_id=p_pipeline_id and status='RUNNING';
 return jsonb_build_object('pipelineId',p.pipeline_id,'topicKey',p.topic_key,'stage',p.stage,'resumeStage',p.resume_stage,'holdReason',p.hold_reason,'retryable',p.retryable,'error',p.last_error);
end $$;

revoke all on function public.content_pipeline_fail_stage_v1(bigint,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_fail_stage_v1(bigint,bigint,text,text,text) to service_role;
