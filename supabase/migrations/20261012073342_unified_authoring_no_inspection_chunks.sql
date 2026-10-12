-- Unified authoring stores one package in existing writer_artifact. No new tables/columns.
-- Legacy stage rows/approved assets remain unchanged; {} defaults remain compatible.
do $guard$ begin
 if pg_get_functiondef(to_regprocedure('public.content_pipeline_complete_stage_v1(bigint,bigint,text,text,jsonb,jsonb,text,bigint,text)')) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_complete_stage_v1(p_pipeline_id bigint, p_pipeline_run_id bigint, p_expected_stage text, p_next_stage text, p_artifact jsonb DEFAULT ''{}''::jsonb, p_image_manifest jsonb DEFAULT NULL::jsonb, p_content_key text DEFAULT NULL::text, p_content_id bigint DEFAULT NULL::bigint, p_production_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
declare
  p public."18_content_pipeline"%rowtype;
  v_sync jsonb;
  v_item jsonb;
  v_validation jsonb;
  v_resolved_content_key text;
begin
  if not ((p_expected_stage=''PLANNING'' and p_next_stage=''PLANNED'') or
          (p_expected_stage=''RESEARCHING'' and p_next_stage=''RESEARCHED'') or
          (p_expected_stage=''WRITING'' and p_next_stage=''DRAFTED'') or
          (p_expected_stage=''VISUAL'' and p_next_stage=''IMAGE_READY'') or
          (p_expected_stage=''QA'' and p_next_stage=''QA_PASS'') or
          (p_expected_stage=''PUBLISHING'' and p_next_stage=''COMPLETE''))
  then
    raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_INVALID_COMPLETION'';
  end if;

  select * into p
  from public."18_content_pipeline"
  where pipeline_id=p_pipeline_id
  for update;

  if not found or p.stage<>p_expected_stage then
    raise exception using errcode=''40001'',message=''CONTENT_PIPELINE_STATE_CONFLICT'';
  end if;

  if p_expected_stage=''WRITING'' and p_next_stage=''DRAFTED'' then
    if jsonb_typeof(p_artifact->''image_briefs'')<>''array'' or jsonb_array_length(p_artifact->''image_briefs'')=0 then
      raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_WRITER_IMAGE_BRIEFS_REQUIRED'';
    end if;

    for v_item in select value from jsonb_array_elements(p_artifact->''image_briefs'') loop
      v_validation:=public.content_pipeline_validate_image_brief_feasibility_v1(v_item);
      if v_validation->>''status''<>''PASS'' then
        raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_WRITER_FEASIBILITY_REQUIRED'',detail=v_validation::text;
      end if;
    end loop;

    v_resolved_content_key := coalesce(
      nullif(trim(p_content_key),''''),
      nullif(trim(p_artifact->>''content_key''),''''),
      nullif(trim(p.content_key),''''),
      nullif(trim(p.topic_key),'''')
    );

    if v_resolved_content_key is null then
      raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_CONTENT_KEY_REQUIRED'';
    end if;
  else
    v_resolved_content_key := coalesce(nullif(trim(p_content_key),''''), p.content_key);
  end if;

  update public."18_content_pipeline" cp
  set stage=p_next_stage,
      planning_artifact=case when p_next_stage=''PLANNED'' then coalesce(p_artifact,''{}'') else planning_artifact end,
      research_artifact=case when p_next_stage=''RESEARCHED'' then coalesce(p_artifact,''{}'') else research_artifact end,
      writer_artifact=case when p_next_stage=''DRAFTED'' then coalesce(p_artifact,''{}'') else writer_artifact end,
      image_manifest=case when p_next_stage=''IMAGE_READY'' then coalesce(p_image_manifest,''[]'') else image_manifest end,
      qa_artifact=case when p_next_stage=''QA_PASS'' then coalesce(p_artifact,''{}'') else qa_artifact end,
      publish_artifact=case when p_next_stage=''COMPLETE'' then coalesce(p_artifact,''{}'') else publish_artifact end,
      content_key=coalesce(v_resolved_content_key,cp.content_key),
      content_id=coalesce(p_content_id,content_id),
      production_url=coalesce(p_production_url,production_url),
      last_error=null,
      updated_at=now(),
      ownership_state=case when p_next_stage=''COMPLETE'' then ''COMPLETE'' else ownership_state end,
      completed_at=case when p_next_stage=''COMPLETE'' then now() else completed_at end
  where pipeline_id=p_pipeline_id
  returning * into p;

  if p_next_stage=''DRAFTED'' then
    v_sync:=public.content_pipeline_sync_images_v1(p_pipeline_id);
    if exists(
      select 1
      from public."21_content_pipeline_image" i
      where i.pipeline_id=p_pipeline_id
        and i.status<>''CANCELLED''
        and (
          i.generation_contract is null
          or i.generation_contract_hash is null
          or (i.generation_contract->''contract_version''=''5''::jsonb and public.content_pipeline_validate_visual_contract_v5(i.generation_contract,true)->>''status'' is distinct from ''PASS'')
          or (i.generation_contract->''contract_version'' is distinct from ''5''::jsonb and coalesce(i.generation_contract->''production_feasibility''->>''status'','''')<>''PASS'')
        )
    ) then
      raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_WRITER_CONTRACT_GATE_FAILED'';
    end if;
  end if;

  if p_next_stage=''COMPLETE'' and (
    p.content_id is null
    or p.production_url is null
    or not exists(
      select 1
      from public."12_content" c
      where c.content_id=p.content_id
        and c.content_key=p.content_key
        and c.is_active=true
        and c.published_at is not null
        and c.published_at<=now()
    )
  ) then
    raise exception using errcode=''40001'',message=''CONTENT_PIPELINE_PRODUCTION_QA_REQUIRED'';
  end if;

  update public."19_content_pipeline_run"
  set status=''PASS'',completed_at=now(),summary=p_next_stage
  where pipeline_run_id=p_pipeline_run_id
    and pipeline_id=p_pipeline_id
    and status=''RUNNING'';

  return jsonb_build_object(
    ''pipelineId'',p.pipeline_id,
    ''topicKey'',p.topic_key,
    ''stage'',p.stage,
    ''contentKey'',p.content_key,
    ''productionUrl'',p.production_url,
    ''imageSync'',case when p_next_stage=''DRAFTED'' then v_sync else null end
  );
end
$function$
' then raise exception 'AUTHORING_BASELINE_DRIFT';end if;
 if pg_get_functiondef(to_regprocedure('public.content_pipeline_fail_stage_v1(bigint,bigint,text,text,text)')) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_fail_stage_v1(p_pipeline_id bigint, p_pipeline_run_id bigint, p_expected_stage text, p_failure_status text, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
declare p public."18_content_pipeline"%rowtype; v_reason text; v_retryable boolean;
begin
 if p_failure_status not in (''HOLD'',''BLOCKED'') then raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_INVALID_FAILURE_STATUS''; end if;
 v_reason := case
   when p_error ilike ''%UNSUPPORTED_EXECUTION_ENVIRONMENT%'' then ''UNSUPPORTED_EXECUTION_ENVIRONMENT''
   when p_error ilike ''%ASSET_PRODUCTION_REQUIRED%'' then ''ASSET_PRODUCTION_REQUIRED''
   when p_error ilike ''%STORAGE_UPLOAD_FAILED%'' then ''STORAGE_UPLOAD_FAILED''
   when p_error ilike ''%RIGHTS_NOT_CONFIRMED%'' then ''RIGHTS_NOT_CONFIRMED''
   when p_error ilike ''%FACT_CONFLICT%'' then ''FACT_CONFLICT''
   else p_failure_status
 end;
 v_retryable := v_reason in (''ASSET_PRODUCTION_REQUIRED'',''STORAGE_UPLOAD_FAILED'');
 update public."18_content_pipeline"
 set stage=p_failure_status,last_error=left(p_error,2000),retry_count=retry_count+1,
     resume_stage=p_expected_stage,hold_reason=v_reason,retryable=v_retryable,updated_at=now()
 where pipeline_id=p_pipeline_id and stage=p_expected_stage and ownership_state=''CLAIMED''
 returning * into p;
 if not found then raise exception using errcode=''40001'',message=''CONTENT_PIPELINE_STATE_CONFLICT''; end if;
 update public."19_content_pipeline_run"
 set status=p_failure_status,completed_at=now(),error=left(p_error,2000),
     metadata=coalesce(metadata,''{}''::jsonb)||jsonb_build_object(''resumeStage'',p_expected_stage,''holdReason'',v_reason,''retryable'',v_retryable)
 where pipeline_run_id=p_pipeline_run_id and pipeline_id=p_pipeline_id and status=''RUNNING'';
 return jsonb_build_object(''pipelineId'',p.pipeline_id,''topicKey'',p.topic_key,''stage'',p.stage,''resumeStage'',p.resume_stage,''holdReason'',p.hold_reason,''retryable'',p.retryable,''error'',p.last_error);
end $function$
' then raise exception 'AUTHORING_BASELINE_DRIFT';end if;
 if pg_get_functiondef(to_regprocedure('public.content_pipeline_publish_queue_v1()')) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_publish_queue_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''''
AS $function$
  select jsonb_build_object(
    ''count'', count(*),
    ''items'', coalesce(
      jsonb_agg(
        jsonb_build_object(
          ''pipelineId'', p.pipeline_id,
          ''contentTopicId'', p.content_topic_id,
          ''topicKey'', p.topic_key,
          ''contentKey'', p.content_key,
          ''title'', coalesce(
            nullif(p.writer_artifact->>''final_title'',''''),
            nullif(p.planning_artifact->>''customer_question'',''''),
            p.topic_key
          ),
          ''stage'', p.stage,
          ''ownershipState'', p.ownership_state,
          ''qaCheckedAt'', p.qa_artifact->>''checked_at'',
          ''updatedAt'', p.updated_at
        )
        order by p.updated_at, p.pipeline_id
      ),
      ''[]''::jsonb
    )
  )
  from public."18_content_pipeline" p
  where p.stage=''QA_PASS''
    and p.ownership_state=''CLAIMED'';
$function$
' then raise exception 'AUTHORING_BASELINE_DRIFT';end if;
 if pg_get_functiondef(to_regprocedure('public.content_pipeline_resume_stage_v1(bigint)')) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_resume_stage_v1(p_pipeline_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
declare p public."18_content_pipeline"%rowtype; r_id bigint; v_run_stage text;
begin
 select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 if not found then raise exception using errcode=''P0002'',message=''CONTENT_PIPELINE_NOT_FOUND''; end if;
 if p.ownership_state <> ''CLAIMED'' then raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_NOT_CLAIMED''; end if;
 if p.stage not in (''HOLD'',''BLOCKED'') or p.resume_stage is null then raise exception using errcode=''22023'',message=''CONTENT_PIPELINE_NOT_RESUMABLE''; end if;
 if exists(select 1 from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id and status=''RUNNING'') then
   raise exception using errcode=''55000'',message=''CONTENT_PIPELINE_RUN_ALREADY_ACTIVE'';
 end if;
 v_run_stage:=p.resume_stage;
 update public."18_content_pipeline"
 set stage=v_run_stage,last_error=null,hold_reason=null,retryable=null,updated_at=now()
 where pipeline_id=p_pipeline_id returning * into p;
 insert into public."19_content_pipeline_run"(pipeline_id,stage,status,metadata)
 values(p_pipeline_id,v_run_stage,''RUNNING'',jsonb_build_object(''resumed'',true,''retryCount'',p.retry_count))
 returning pipeline_run_id into r_id;
 return jsonb_build_object(''pipelineId'',p.pipeline_id,''pipelineRunId'',r_id,''topicKey'',p.topic_key,''stage'',p.stage,''resumed'',true,''pipeline'',to_jsonb(p));
end $function$
' then raise exception 'AUTHORING_BASELINE_DRIFT';end if;
 if pg_get_functiondef(to_regprocedure('public.content_pipeline_resume_stage_v1(bigint,text)')) is distinct from 'CREATE OR REPLACE FUNCTION public.content_pipeline_resume_stage_v1(p_pipeline_id bigint, p_running_stage text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''''
AS $function$
declare
  p public."18_content_pipeline"%rowtype;
  prev_stage text;
  prev_status text;
  r_id bigint;
begin
  if p_running_stage not in (''RESEARCHING'',''WRITING'',''VISUAL'',''QA'',''PUBLISHING'') then
    raise exception using errcode=''22023'', message=''CONTENT_PIPELINE_INVALID_RESUME_STAGE'';
  end if;

  select * into p
  from public."18_content_pipeline"
  where pipeline_id = p_pipeline_id
  for update;

  if not found then
    raise exception using errcode=''P0002'', message=''CONTENT_PIPELINE_NOT_FOUND'';
  end if;

  if p.stage <> ''HOLD'' or p.ownership_state <> ''CLAIMED'' then
    raise exception using errcode=''40001'', message=''CONTENT_PIPELINE_NOT_RESUMABLE'';
  end if;

  select r.stage, r.status
    into prev_stage, prev_status
  from public."19_content_pipeline_run" r
  where r.pipeline_id = p_pipeline_id
    and r.status = ''HOLD''
  order by r.pipeline_run_id desc
  limit 1;

  if prev_stage is null or prev_stage <> p_running_stage or prev_status <> ''HOLD'' then
    raise exception using errcode=''40001'', message=''CONTENT_PIPELINE_RESUME_STAGE_MISMATCH'';
  end if;

  if p_running_stage = ''RESEARCHING'' and coalesce(p.planning_artifact, ''{}''::jsonb) = ''{}''::jsonb then
    raise exception using errcode=''40001'', message=''CONTENT_PIPELINE_RESUME_MISSING_PLANNING'';
  end if;
  if p_running_stage = ''WRITING'' and coalesce(p.research_artifact, ''{}''::jsonb) = ''{}''::jsonb then
    raise exception using errcode=''40001'', message=''CONTENT_PIPELINE_RESUME_MISSING_RESEARCH'';
  end if;
  if p_running_stage = ''VISUAL'' and coalesce(p.writer_artifact, ''{}''::jsonb) = ''{}''::jsonb then
    raise exception using errcode=''40001'', message=''CONTENT_PIPELINE_RESUME_MISSING_WRITER'';
  end if;
  if p_running_stage = ''QA'' and coalesce(p.image_manifest, ''[]''::jsonb) = ''[]''::jsonb then
    raise exception using errcode=''40001'', message=''CONTENT_PIPELINE_RESUME_MISSING_IMAGES'';
  end if;
  if p_running_stage = ''PUBLISHING'' and coalesce(p.qa_artifact, ''{}''::jsonb) = ''{}''::jsonb then
    raise exception using errcode=''40001'', message=''CONTENT_PIPELINE_RESUME_MISSING_QA'';
  end if;

  update public."18_content_pipeline"
  set stage = p_running_stage,
      last_error = null,
      updated_at = now()
  where pipeline_id = p_pipeline_id
  returning * into p;

  insert into public."19_content_pipeline_run"(pipeline_id, stage, status, metadata)
  values (
    p_pipeline_id,
    p_running_stage,
    ''RUNNING'',
    jsonb_build_object(
      ''resumedFrom'', ''HOLD'',
      ''resumeReason'', ''RETRYABLE_PAUSE'',
      ''previousStage'', prev_stage
    )
  )
  returning pipeline_run_id into r_id;

  return jsonb_build_object(
    ''pipelineId'', p.pipeline_id,
    ''pipelineRunId'', r_id,
    ''topicKey'', p.topic_key,
    ''contentKey'', p.content_key,
    ''stage'', p.stage,
    ''resumedFrom'', ''HOLD''
  );
end
$function$
' then raise exception 'AUTHORING_BASELINE_DRIFT';end if;
 if to_regprocedure('public.content_pipeline_claim_authoring_v1(uuid,bigint)') is not null or to_regprocedure('public.content_pipeline_complete_authoring_v1(bigint,bigint,jsonb)') is not null then raise exception 'AUTHORING_RPC_ALREADY_PRESENT';end if;
end $guard$;
create function public.content_pipeline_claim_authoring_v1(p_request_id uuid,p_pipeline_id bigint default null)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare p public."18_content_pipeline"%rowtype; t public."16_content_topic"%rowtype; r public."19_content_pipeline_run"%rowtype; prior public."19_content_pipeline_run"%rowtype;
begin
 if p_request_id is null or (p_pipeline_id is not null and p_pipeline_id<1) then raise exception 'AUTHORING_REQUEST_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('fitbike-authoring:'||p_request_id::text,0));
 select * into prior from public."19_content_pipeline_run" where metadata->>'executionMode'='AUTHORING_V1' and metadata->>'authoringRequestId'=p_request_id::text order by pipeline_run_id limit 1;
 if found then
  if not (prior.metadata ? 'targetPipelineId') or (prior.metadata->>'targetPipelineId')::bigint is distinct from p_pipeline_id then raise exception 'AUTHORING_REQUEST_TARGET_CONFLICT';end if;
  select * into p from public."18_content_pipeline" where pipeline_id=prior.pipeline_id for update;
  select * into r from public."19_content_pipeline_run" where pipeline_run_id=prior.pipeline_run_id for update;
  select * into t from public."16_content_topic" where content_topic_id=p.content_topic_id;
  return jsonb_build_object('requestId',p_request_id,'pipelineId',p.pipeline_id,'pipelineRunId',r.pipeline_run_id,'topicKey',p.topic_key,'stage',p.stage,'executionMode','AUTHORING_V1','activeExecution',r.status='RUNNING' and p.stage='WRITING','replayed',true,'topic',to_jsonb(t),'writerArtifact',p.writer_artifact,'packageExecution',jsonb_build_object('pipelineId',p.pipeline_id,'pipelineRunId',r.pipeline_run_id,'topicKey',p.topic_key),'nextAction',case when r.status='RUNNING' and p.stage='WRITING' then 'CONTINUE_AUTHORING' else 'READ_CURRENT_STAGE_BEFORE_NEW_INTENT' end);
 end if;
 if p_pipeline_id is null then
  select * into t from public."16_content_topic" where status='PLANNED' and content_id is null
   and not exists(select 1 from public."18_content_pipeline" p0 where p0.content_topic_id="16_content_topic".content_topic_id and p0.ownership_state in ('CLAIMED','COMPLETE'))
   order by priority,created_at,content_topic_id for update skip locked limit 1;
  if not found then return jsonb_build_object('requestId',p_request_id,'result','NO_ELIGIBLE_TOPIC','activeExecution',false);end if;
  insert into public."18_content_pipeline"(content_topic_id,topic_key,stage,ownership_state)
   values(t.content_topic_id,t.topic_key,'WRITING','CLAIMED') returning * into p;
 else
  select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
  if not found or p.ownership_state<>'CLAIMED' then raise exception 'AUTHORING_PIPELINE_NOT_OWNED';end if;
  select * into prior from public."19_content_pipeline_run" where pipeline_id=p.pipeline_id order by pipeline_run_id desc limit 1 for update;
  if not found or prior.metadata->>'executionMode' is distinct from 'AUTHORING_V1' then raise exception 'AUTHORING_LEGACY_PIPELINE_USE_EXISTING_RESUME';end if;
  if exists(select 1 from public."19_content_pipeline_run" where pipeline_id=p.pipeline_id and status='RUNNING') then raise exception 'AUTHORING_EXECUTION_BUSY';end if;
  if p.stage not in ('HOLD','BLOCKED') or p.resume_stage is distinct from 'WRITING' then raise exception 'AUTHORING_PIPELINE_NOT_RESUMABLE';end if;
  update public."18_content_pipeline" set stage='WRITING',last_error=null,hold_reason=null,retryable=null,updated_at=now() where pipeline_id=p.pipeline_id returning * into p;
  select * into t from public."16_content_topic" where content_topic_id=p.content_topic_id;
 end if;
 insert into public."19_content_pipeline_run"(pipeline_id,stage,status,metadata)
  values(p.pipeline_id,'WRITING','RUNNING',jsonb_build_object('executionMode','AUTHORING_V1','authoringRequestId',p_request_id,'targetPipelineId',p_pipeline_id)) returning * into r;
 return jsonb_build_object('requestId',p_request_id,'pipelineId',p.pipeline_id,'pipelineRunId',r.pipeline_run_id,'topicKey',p.topic_key,'stage','WRITING','executionMode','AUTHORING_V1','activeExecution',true,'topic',to_jsonb(t),'packageExecution',jsonb_build_object('pipelineId',p.pipeline_id,'pipelineRunId',r.pipeline_run_id,'topicKey',p.topic_key),'nextAction','RESEARCH_WRITE_PLAN_VISUALS_THEN_COMPLETE_AUTHORING');
end $function$;

create function public.content_pipeline_complete_authoring_v1(p_pipeline_id bigint,p_pipeline_run_id bigint,p_package jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $function$
declare artifact jsonb;
begin
 if jsonb_typeof(p_package) is distinct from 'object' or p_package->'version' is distinct from '1'::jsonb
  or exists(select 1 from jsonb_object_keys(p_package) k where k not in ('version','execution','planning','research','writer'))
  or jsonb_typeof(p_package->'writer') is distinct from 'object' or p_package->'writer' ? 'authoringContext' then raise exception 'AUTHORING_PACKAGE_INVALID';end if;
 artifact:=(p_package->'writer')||jsonb_build_object('authoringContext',jsonb_build_object('version',1,'execution',p_package->'execution','planning',p_package->'planning','research',p_package->'research'));
 return public.content_pipeline_complete_stage_v1(p_pipeline_id,p_pipeline_run_id,'WRITING','DRAFTED',artifact);
end $function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_complete_stage_v1(p_pipeline_id bigint, p_pipeline_run_id bigint, p_expected_stage text, p_next_stage text, p_artifact jsonb DEFAULT '{}'::jsonb, p_image_manifest jsonb DEFAULT NULL::jsonb, p_content_key text DEFAULT NULL::text, p_content_id bigint DEFAULT NULL::bigint, p_production_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public."18_content_pipeline"%rowtype;
  v_sync jsonb;
  v_item jsonb;
  v_validation jsonb;
  v_resolved_content_key text;
  v_run public."19_content_pipeline_run"%rowtype; v_authoring boolean; v_authoring_hash text; v_receipt jsonb;
begin
  if not ((p_expected_stage='PLANNING' and p_next_stage='PLANNED') or
          (p_expected_stage='RESEARCHING' and p_next_stage='RESEARCHED') or
          (p_expected_stage='WRITING' and p_next_stage='DRAFTED') or
          (p_expected_stage='VISUAL' and p_next_stage='IMAGE_READY') or
          (p_expected_stage='QA' and p_next_stage='QA_PASS') or
          (p_expected_stage='PUBLISHING' and p_next_stage='COMPLETE'))
  then
    raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_COMPLETION';
  end if;

  select * into p
  from public."18_content_pipeline"
  where pipeline_id=p_pipeline_id
  for update;

  select * into v_run from public."19_content_pipeline_run" where pipeline_run_id=p_pipeline_run_id and pipeline_id=p_pipeline_id for update;
  v_authoring:=coalesce(v_run.metadata->>'executionMode'='AUTHORING_V1',false) or exists(select 1 from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id and status='RUNNING' and metadata->>'executionMode'='AUTHORING_V1');
  if v_authoring then
    if v_run.pipeline_run_id is null or v_run.metadata->>'executionMode' is distinct from 'AUTHORING_V1' or v_run.stage<>'WRITING' or p_expected_stage<>'WRITING' or p_next_stage<>'DRAFTED' then raise exception 'AUTHORING_RUN_MISMATCH';end if;
    if jsonb_typeof(p_artifact->'authoringContext') is distinct from 'object'
      or p_artifact->'authoringContext'->'version' is distinct from '1'::jsonb
      or p_artifact->'authoringContext'->'execution' is distinct from jsonb_build_object('pipelineId',p_pipeline_id,'pipelineRunId',p_pipeline_run_id,'topicKey',p.topic_key)
      or jsonb_typeof(p_artifact->'authoringContext'->'planning') is distinct from 'object' or p_artifact->'authoringContext'->'planning'='{}'::jsonb
      or jsonb_typeof(p_artifact->'authoringContext'->'research') is distinct from 'object' or p_artifact->'authoringContext'->'research'='{}'::jsonb then raise exception 'AUTHORING_PACKAGE_CONTEXT_INVALID';end if;
    v_authoring_hash:=encode(extensions.digest(convert_to(p_artifact::text,'UTF8'),'sha256'),'hex');
    if v_run.status='PASS' then
      if v_run.metadata->>'authoringPackageHash' is distinct from v_authoring_hash or p.writer_artifact->'authoringContext'->'execution' is distinct from p_artifact->'authoringContext'->'execution' then raise exception 'AUTHORING_COMPLETION_REPLAY_CONFLICT';end if;
      return (v_run.metadata->'authoringReceipt')||jsonb_build_object('replayed',true,'currentStage',p.stage);
    end if;
    if v_run.status<>'RUNNING' or p.stage<>'WRITING' or p.ownership_state<>'CLAIMED' then raise exception 'AUTHORING_RUN_INACTIVE';end if;
    if jsonb_typeof(p_artifact->'image_briefs') is distinct from 'array' or exists(select 1 from jsonb_array_elements(p_artifact->'image_briefs') b where b->'contract_version' is distinct from '5'::jsonb) then raise exception 'AUTHORING_V5_BRIEFS_REQUIRED';end if;
  end if;

  if p.pipeline_id is null or p.stage<>p_expected_stage then
    raise exception using errcode='40001',message='CONTENT_PIPELINE_STATE_CONFLICT';
  end if;

  if p_expected_stage='WRITING' and p_next_stage='DRAFTED' then
    if jsonb_typeof(p_artifact->'image_briefs')<>'array' or jsonb_array_length(p_artifact->'image_briefs')=0 then
      raise exception using errcode='22023',message='CONTENT_PIPELINE_WRITER_IMAGE_BRIEFS_REQUIRED';
    end if;

    for v_item in select value from jsonb_array_elements(p_artifact->'image_briefs') loop
      v_validation:=public.content_pipeline_validate_image_brief_feasibility_v1(v_item);
      if v_validation->>'status'<>'PASS' then
        raise exception using errcode='22023',message='CONTENT_PIPELINE_WRITER_FEASIBILITY_REQUIRED',detail=v_validation::text;
      end if;
    end loop;

    v_resolved_content_key := coalesce(
      nullif(trim(p_content_key),''),
      nullif(trim(p_artifact->>'content_key'),''),
      nullif(trim(p.content_key),''),
      nullif(trim(p.topic_key),'')
    );

    if v_resolved_content_key is null then
      raise exception using errcode='22023',message='CONTENT_PIPELINE_CONTENT_KEY_REQUIRED';
    end if;
  else
    v_resolved_content_key := coalesce(nullif(trim(p_content_key),''), p.content_key);
  end if;

  update public."18_content_pipeline" cp
  set stage=p_next_stage,
      planning_artifact=case when p_next_stage='PLANNED' then coalesce(p_artifact,'{}') else planning_artifact end,
      research_artifact=case when p_next_stage='RESEARCHED' then coalesce(p_artifact,'{}') else research_artifact end,
      writer_artifact=case when p_next_stage='DRAFTED' then coalesce(p_artifact,'{}') else writer_artifact end,
      image_manifest=case when p_next_stage='IMAGE_READY' then coalesce(p_image_manifest,'[]') else image_manifest end,
      qa_artifact=case when p_next_stage='QA_PASS' then coalesce(p_artifact,'{}') else qa_artifact end,
      publish_artifact=case when p_next_stage='COMPLETE' then coalesce(p_artifact,'{}') else publish_artifact end,
      content_key=coalesce(v_resolved_content_key,cp.content_key),
      content_id=coalesce(p_content_id,content_id),
      production_url=coalesce(p_production_url,production_url),
      last_error=null,
      updated_at=now(),
      ownership_state=case when p_next_stage='COMPLETE' then 'COMPLETE' else ownership_state end,
      completed_at=case when p_next_stage='COMPLETE' then now() else completed_at end
  where pipeline_id=p_pipeline_id
  returning * into p;

  if p_next_stage='DRAFTED' then
    v_sync:=public.content_pipeline_sync_images_v1(p_pipeline_id);
    if exists(
      select 1
      from public."21_content_pipeline_image" i
      where i.pipeline_id=p_pipeline_id
        and i.status<>'CANCELLED'
        and (
          i.generation_contract is null
          or i.generation_contract_hash is null
          or (i.generation_contract->'contract_version'='5'::jsonb and public.content_pipeline_validate_visual_contract_v5(i.generation_contract,true)->>'status' is distinct from 'PASS')
          or (i.generation_contract->'contract_version' is distinct from '5'::jsonb and coalesce(i.generation_contract->'production_feasibility'->>'status','')<>'PASS')
        )
    ) then
      raise exception using errcode='22023',message='CONTENT_PIPELINE_WRITER_CONTRACT_GATE_FAILED';
    end if;
  end if;

  if p_next_stage='COMPLETE' and (
    p.content_id is null
    or p.production_url is null
    or not exists(
      select 1
      from public."12_content" c
      where c.content_id=p.content_id
        and c.content_key=p.content_key
        and c.is_active=true
        and c.published_at is not null
        and c.published_at<=now()
    )
  ) then
    raise exception using errcode='40001',message='CONTENT_PIPELINE_PRODUCTION_QA_REQUIRED';
  end if;

  update public."19_content_pipeline_run"
  set status='PASS',completed_at=now(),summary=p_next_stage
  where pipeline_run_id=p_pipeline_run_id
    and pipeline_id=p_pipeline_id
    and status='RUNNING';

  v_receipt:=jsonb_build_object(
    'pipelineId',p.pipeline_id,
    'topicKey',p.topic_key,
    'stage',p.stage,
    'contentKey',p.content_key,
    'productionUrl',p.production_url,
    'imageSync',case when p_next_stage='DRAFTED' then v_sync else null end
  );
  if v_authoring then
    v_receipt:=v_receipt||jsonb_build_object('pipelineRunId',p_pipeline_run_id,'executionMode','AUTHORING_V1');
    update public."19_content_pipeline_run" set metadata=coalesce(metadata,'{}')||jsonb_build_object('authoringPackageHash',v_authoring_hash,'authoringReceipt',v_receipt) where pipeline_run_id=p_pipeline_run_id and pipeline_id=p_pipeline_id and status='PASS';
  end if;
  return v_receipt;
end
$function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_fail_stage_v1(p_pipeline_id bigint, p_pipeline_run_id bigint, p_expected_stage text, p_failure_status text, p_error text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public."18_content_pipeline"%rowtype; v_reason text; v_retryable boolean; v_run public."19_content_pipeline_run"%rowtype;
begin
 if p_failure_status not in ('HOLD','BLOCKED') then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_FAILURE_STATUS'; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 select * into v_run from public."19_content_pipeline_run" where pipeline_run_id=p_pipeline_run_id and pipeline_id=p_pipeline_id for update;
 if coalesce(v_run.metadata->>'executionMode'='AUTHORING_V1',false) or exists(select 1 from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id and status='RUNNING' and metadata->>'executionMode'='AUTHORING_V1') then
   if v_run.pipeline_run_id is null or v_run.metadata->>'executionMode' is distinct from 'AUTHORING_V1' or v_run.stage<>'WRITING' or v_run.status<>'RUNNING' or p_expected_stage<>'WRITING' or p.stage<>'WRITING' then raise exception 'AUTHORING_RUN_MISMATCH';end if;
 end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_resume_stage_v1(p_pipeline_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public."18_content_pipeline"%rowtype; r_id bigint; v_run_stage text;
begin
 if exists(select 1 from public."19_content_pipeline_run" where pipeline_run_id=(select max(pipeline_run_id) from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id) and metadata->>'executionMode'='AUTHORING_V1') then
  raise exception 'AUTHORING_RESUME_REQUIRES_REQUEST_ID';
 end if;
 select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_NOT_FOUND'; end if;
 if p.ownership_state <> 'CLAIMED' then raise exception using errcode='22023',message='CONTENT_PIPELINE_NOT_CLAIMED'; end if;
 if p.stage not in ('HOLD','BLOCKED') or p.resume_stage is null then raise exception using errcode='22023',message='CONTENT_PIPELINE_NOT_RESUMABLE'; end if;
 if exists(select 1 from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id and status='RUNNING') then
   raise exception using errcode='55000',message='CONTENT_PIPELINE_RUN_ALREADY_ACTIVE';
 end if;
 v_run_stage:=p.resume_stage;
 update public."18_content_pipeline"
 set stage=v_run_stage,last_error=null,hold_reason=null,retryable=null,updated_at=now()
 where pipeline_id=p_pipeline_id returning * into p;
 insert into public."19_content_pipeline_run"(pipeline_id,stage,status,metadata)
 values(p_pipeline_id,v_run_stage,'RUNNING',jsonb_build_object('resumed',true,'retryCount',p.retry_count))
 returning pipeline_run_id into r_id;
 return jsonb_build_object('pipelineId',p.pipeline_id,'pipelineRunId',r_id,'topicKey',p.topic_key,'stage',p.stage,'resumed',true,'pipeline',to_jsonb(p));
end $function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_resume_stage_v1(p_pipeline_id bigint, p_running_stage text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  p public."18_content_pipeline"%rowtype;
  prev_stage text;
  prev_status text;
  r_id bigint;
begin
 if exists(select 1 from public."19_content_pipeline_run" where pipeline_run_id=(select max(pipeline_run_id) from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id) and metadata->>'executionMode'='AUTHORING_V1') then
  if p_running_stage<>'WRITING' then raise exception 'AUTHORING_RESUME_STAGE_MISMATCH';end if;
  raise exception 'AUTHORING_RESUME_REQUIRES_REQUEST_ID';
 end if;
  if p_running_stage not in ('RESEARCHING','WRITING','VISUAL','QA','PUBLISHING') then
    raise exception using errcode='22023', message='CONTENT_PIPELINE_INVALID_RESUME_STAGE';
  end if;

  select * into p
  from public."18_content_pipeline"
  where pipeline_id = p_pipeline_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='CONTENT_PIPELINE_NOT_FOUND';
  end if;

  if p.stage <> 'HOLD' or p.ownership_state <> 'CLAIMED' then
    raise exception using errcode='40001', message='CONTENT_PIPELINE_NOT_RESUMABLE';
  end if;

  select r.stage, r.status
    into prev_stage, prev_status
  from public."19_content_pipeline_run" r
  where r.pipeline_id = p_pipeline_id
    and r.status = 'HOLD'
  order by r.pipeline_run_id desc
  limit 1;

  if prev_stage is null or prev_stage <> p_running_stage or prev_status <> 'HOLD' then
    raise exception using errcode='40001', message='CONTENT_PIPELINE_RESUME_STAGE_MISMATCH';
  end if;

  if p_running_stage = 'RESEARCHING' and coalesce(p.planning_artifact, '{}'::jsonb) = '{}'::jsonb then
    raise exception using errcode='40001', message='CONTENT_PIPELINE_RESUME_MISSING_PLANNING';
  end if;
  if p_running_stage = 'WRITING' and coalesce(p.research_artifact, '{}'::jsonb) = '{}'::jsonb then
    raise exception using errcode='40001', message='CONTENT_PIPELINE_RESUME_MISSING_RESEARCH';
  end if;
  if p_running_stage = 'VISUAL' and coalesce(p.writer_artifact, '{}'::jsonb) = '{}'::jsonb then
    raise exception using errcode='40001', message='CONTENT_PIPELINE_RESUME_MISSING_WRITER';
  end if;
  if p_running_stage = 'QA' and coalesce(p.image_manifest, '[]'::jsonb) = '[]'::jsonb then
    raise exception using errcode='40001', message='CONTENT_PIPELINE_RESUME_MISSING_IMAGES';
  end if;
  if p_running_stage = 'PUBLISHING' and coalesce(p.qa_artifact, '{}'::jsonb) = '{}'::jsonb then
    raise exception using errcode='40001', message='CONTENT_PIPELINE_RESUME_MISSING_QA';
  end if;

  update public."18_content_pipeline"
  set stage = p_running_stage,
      last_error = null,
      updated_at = now()
  where pipeline_id = p_pipeline_id
  returning * into p;

  insert into public."19_content_pipeline_run"(pipeline_id, stage, status, metadata)
  values (
    p_pipeline_id,
    p_running_stage,
    'RUNNING',
    jsonb_build_object(
      'resumedFrom', 'HOLD',
      'resumeReason', 'RETRYABLE_PAUSE',
      'previousStage', prev_stage
    )
  )
  returning pipeline_run_id into r_id;

  return jsonb_build_object(
    'pipelineId', p.pipeline_id,
    'pipelineRunId', r_id,
    'topicKey', p.topic_key,
    'contentKey', p.content_key,
    'stage', p.stage,
    'resumedFrom', 'HOLD'
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_publish_queue_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'count', count(*),
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pipelineId', p.pipeline_id,
          'contentTopicId', p.content_topic_id,
          'topicKey', p.topic_key,
          'contentKey', p.content_key,
          'title', coalesce(
            nullif(p.writer_artifact->>'final_title',''),
            nullif(p.planning_artifact->>'customer_question',''),
            nullif(p.writer_artifact->'authoringContext'->'planning'->>'customer_question',''),
            p.topic_key
          ),
          'stage', p.stage,
          'ownershipState', p.ownership_state,
          'qaCheckedAt', p.qa_artifact->>'checked_at',
          'updatedAt', p.updated_at
        )
        order by p.updated_at, p.pipeline_id
      ),
      '[]'::jsonb
    )
  )
  from public."18_content_pipeline" p
  where p.stage='QA_PASS'
    and p.ownership_state='CLAIMED';
$function$;
revoke all on function public.content_pipeline_claim_authoring_v1(uuid,bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_claim_authoring_v1(uuid,bigint) to service_role;
revoke all on function public.content_pipeline_complete_authoring_v1(bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_complete_authoring_v1(bigint,bigint,jsonb) to service_role;
notify pgrst,'reload schema';
