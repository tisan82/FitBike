begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $qa$
declare t bigint; c jsonb; again jsonb; done jsonb; pack jsonb; pid bigint; rid bigint; before_images integer; failed boolean; resumed jsonb;
begin
 insert into public."16_content_topic"(topic_key,topic,content_type,normalized_subject,normalized_action,normalized_scope,status,priority,created_at)
 values('qa-authoring-'||extensions.gen_random_uuid()::text,'Authoring rollback fixture','MAINTENANCE','authoring-fixture','CHECK','GENERIC','PLANNED',1,'-infinity') returning content_topic_id into t;
 c:=public.content_pipeline_claim_authoring_v1(extensions.gen_random_uuid(),null);
 if (c->'topic'->>'content_topic_id')::bigint<>t then raise exception 'AUTHORING_FIXTURE_NOT_SELECTED';end if;
 pid:=(c->>'pipelineId')::bigint;rid:=(c->>'pipelineRunId')::bigint;
 again:=public.content_pipeline_claim_authoring_v1((c->>'requestId')::uuid,null);
 if again->>'pipelineRunId'<>c->>'pipelineRunId' or (select count(*) from public."19_content_pipeline_run" where pipeline_id=pid)<>1 then raise exception 'AUTHORING_CLAIM_REPLAY_FAILED';end if;
 pack:=jsonb_build_object(
  'version',1,'execution',c->'packageExecution',
  'planning','{"customer_question":"How to inspect parked motorcycle condition?"}'::jsonb,
  'research','{"fact_register":[{"fact_id":"CF1","claim":"Rollback fixture only","verification":"TEST_FIXTURE"}]}'::jsonb,
  'writer',jsonb_build_object('content_key','qa-authoring-'||t,'final_title','Authoring fixture','image_briefs',
    '[{"contract_version":5,"image_id":"IMG_01","asset_role":"BODY","user_question":"What should I inspect?","visual_objective":"Show a parked motorcycle seat","must_show":["parked motorcycle seat"],"must_not_show":["moving motorcycle"],"evidence_requirement":{"level":"NONE"},"alt_text_draft":"Parked motorcycle seat"}]'::jsonb));
 failed:=false;begin perform public.content_pipeline_complete_authoring_v1(pid,rid,pack||jsonb_build_object('execution',jsonb_build_object('pipelineId',pid,'pipelineRunId',rid+1,'topicKey',c->>'topicKey')));exception when others then failed:=true;end;
 if not failed then raise exception 'AUTHORING_STALE_PACKAGE_ALLOWED';end if;
 failed:=false;begin perform public.content_pipeline_fail_stage_v1(pid,rid+1,'WRITING','HOLD','test');exception when others then failed:=true;end;
 if not failed or (select stage from public."18_content_pipeline" where pipeline_id=pid)<>'WRITING' then raise exception 'AUTHORING_FOREIGN_FAILURE_ALLOWED';end if;
 done:=public.content_pipeline_complete_authoring_v1(pid,rid,pack);
 if done->>'stage'<>'DRAFTED' or (select planning_artifact<>'{}'::jsonb or research_artifact<>'{}'::jsonb from public."18_content_pipeline" where pipeline_id=pid) then raise exception 'AUTHORING_DUPLICATE_STORAGE';end if;
 if not (select writer_artifact->'authoringContext'->'planning'=pack->'planning' and writer_artifact->'authoringContext'->'research'=pack->'research' from public."18_content_pipeline" where pipeline_id=pid) then raise exception 'AUTHORING_PACKAGE_STORAGE_FAILED';end if;
 select count(*) into before_images from public."21_content_pipeline_image" where pipeline_id=pid;
 if before_images<>1 or exists(select 1 from public."21_content_pipeline_image" where pipeline_id=pid and (generation_contract_hash is null or generation_contract->'contract_version'<>'5'::jsonb)) then raise exception 'AUTHORING_V5_SYNC_FAILED';end if;
 again:=public.content_pipeline_complete_authoring_v1(pid,rid,pack);
 if again->>'replayed'<>'true' or (select count(*) from public."21_content_pipeline_image" where pipeline_id=pid)<>before_images then raise exception 'AUTHORING_COMPLETION_REPLAY_FAILED';end if;
 failed:=false;begin perform public.content_pipeline_complete_authoring_v1(pid,rid,pack||jsonb_build_object('planning',jsonb_build_object('changed',true)));exception when others then failed:=true;end;
 if not failed then raise exception 'AUTHORING_CHANGED_REPLAY_ALLOWED';end if;
 if has_function_privilege('anon','public.content_pipeline_claim_authoring_v1(uuid,bigint)','execute') or has_function_privilege('authenticated','public.content_pipeline_complete_authoring_v1(bigint,bigint,jsonb)','execute') then raise exception 'AUTHORING_PUBLIC_EXECUTE_ALLOWED';end if;
 -- A second controlled topic exercises failure and fresh execution identity.
 insert into public."16_content_topic"(topic_key,topic,content_type,normalized_subject,normalized_action,normalized_scope,status,priority,created_at)
 values('qa-authoring-resume-'||extensions.gen_random_uuid()::text,'Authoring resume fixture','MAINTENANCE','authoring-resume-fixture','CHECK','GENERIC','PLANNED',1,'-infinity') returning content_topic_id into t;
 c:=public.content_pipeline_claim_authoring_v1(extensions.gen_random_uuid(),null);
 if (c->'topic'->>'content_topic_id')::bigint<>t then raise exception 'AUTHORING_FIXTURE_NOT_SELECTED';end if;
 pid:=(c->>'pipelineId')::bigint;rid:=(c->>'pipelineRunId')::bigint;
 perform public.content_pipeline_fail_stage_v1(pid,rid,'WRITING','HOLD','Test fixture interruption');
 resumed:=public.content_pipeline_claim_authoring_v1(extensions.gen_random_uuid(),pid);
 if resumed->>'pipelineRunId'=c->>'pipelineRunId' or resumed->>'stage'<>'WRITING' then raise exception 'AUTHORING_RESUME_FENCE_FAILED';end if;
 failed:=false;begin perform public.content_pipeline_fail_stage_v1(pid,rid,'WRITING','HOLD','late old failure');exception when others then failed:=true;end;
 if not failed then raise exception 'AUTHORING_OLD_FAILURE_ALLOWED';end if;
end $qa$;
rollback;
