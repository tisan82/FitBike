-- Keep combined scheduled workers on the same pipeline row across adjacent stages.
create or replace function public.content_pipeline_claim_stage_by_id_v1(
  p_pipeline_id bigint,
  p_expected_stage text,
  p_running_stage text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare p public."18_content_pipeline"%rowtype; r_id bigint;
begin
  if not ((p_expected_stage='PLANNED' and p_running_stage='RESEARCHING') or
          (p_expected_stage='RESEARCHED' and p_running_stage='WRITING') or
          (p_expected_stage='IMAGE_READY' and p_running_stage='QA') or
          (p_expected_stage='QA_PASS' and p_running_stage='PUBLISHING')) then
    raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_CLAIM';
  end if;
  select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
  if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_NOT_FOUND'; end if;
  if p.ownership_state<>'CLAIMED' or p.stage<>p_expected_stage then
    raise exception using errcode='40001',message='CONTENT_PIPELINE_STATE_CONFLICT';
  end if;
  if exists(select 1 from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id and status='RUNNING') then
    raise exception using errcode='55000',message='CONTENT_PIPELINE_RUN_ALREADY_ACTIVE';
  end if;
  update public."18_content_pipeline" set stage=p_running_stage,updated_at=now(),last_error=null
  where pipeline_id=p_pipeline_id and ownership_state='CLAIMED' and stage=p_expected_stage returning * into p;
  insert into public."19_content_pipeline_run"(pipeline_id,stage,status,metadata)
  values(p_pipeline_id,p_running_stage,'RUNNING',jsonb_build_object('claimedById',true,'previousStage',p_expected_stage))
  returning pipeline_run_id into r_id;
  return jsonb_build_object('pipelineId',p.pipeline_id,'pipelineRunId',r_id,'pipeline',to_jsonb(p));
end $$;
revoke all on function public.content_pipeline_claim_stage_by_id_v1(bigint,text,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_claim_stage_by_id_v1(bigint,text,text) to service_role;
