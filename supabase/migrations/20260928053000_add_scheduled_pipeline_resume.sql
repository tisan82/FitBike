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
