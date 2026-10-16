begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $qa$
declare sid uuid; imageid bigint; ihash text; si jsonb; sp jsonb; receipt jsonb; t bigint; c jsonb; again jsonb; done jsonb; pack jsonb; pid bigint; rid bigint; before_images integer; failed boolean; resumed jsonb;
begin
 insert into public."16_content_topic"(topic_key,topic,content_type,normalized_subject,normalized_action,normalized_scope,status,priority,created_at)
 values('qa-authoring-'||extensions.gen_random_uuid()::text,'Authoring rollback fixture','MAINTENANCE','authoring-fixture','CHECK','GENERIC','PLANNED',1,'-infinity') returning content_topic_id into t;
 c:=public.content_pipeline_claim_authoring_supply_v1('qa-source-supply',extensions.gen_random_uuid(),null);
 if (c->'topic'->>'content_topic_id')::bigint<>t then raise exception 'AUTHORING_FIXTURE_NOT_SELECTED';end if;
 pid:=(c->>'pipelineId')::bigint;rid:=(c->>'pipelineRunId')::bigint;
 again:=public.content_pipeline_claim_authoring_supply_v1('qa-source-supply',(c->>'requestId')::uuid,null);
 if again->>'pipelineRunId'<>c->>'pipelineRunId' or (select count(*) from public."19_content_pipeline_run" where pipeline_id=pid)<>1 then raise exception 'AUTHORING_CLAIM_REPLAY_FAILED';end if;
 pack:=jsonb_build_object(
  'version',1,'execution',c->'packageExecution',
  'planning','{"customer_question":"How to inspect parked motorcycle condition?"}'::jsonb,
  'research','{"fact_register":[{"fact_id":"CF1","claim":"Rollback fixture only","verification":"TEST_FIXTURE"}]}'::jsonb,
  'writer',jsonb_build_object('content_key','qa-authoring-'||t,'final_title','Authoring fixture','image_briefs',
    '[{"contract_version":5,"image_id":"IMG_01","asset_role":"BODY","user_question":"What should I inspect?","visual_objective":"Show a parked motorcycle seat","must_show":["parked motorcycle seat"],"must_not_show":["moving motorcycle"],"evidence_requirement":{"level":"NONE"},"alt_text_draft":"Parked motorcycle seat"}]'::jsonb));
 failed:=false;begin perform public.content_pipeline_complete_authoring_supply_v1('qa-source-supply',pid,rid,pack||jsonb_build_object('execution',jsonb_build_object('pipelineId',pid,'pipelineRunId',rid+1,'topicKey',c->>'topicKey')));exception when others then failed:=true;end;
 if not failed then raise exception 'AUTHORING_STALE_PACKAGE_ALLOWED';end if;
 failed:=false;begin perform public.content_pipeline_fail_stage_v1(pid,rid+1,'WRITING','HOLD','test');exception when others then failed:=true;end;
 if not failed or (select stage from public."18_content_pipeline" where pipeline_id=pid)<>'WRITING' then raise exception 'AUTHORING_FOREIGN_FAILURE_ALLOWED';end if;
 done:=public.content_pipeline_complete_authoring_supply_v1('qa-source-supply',pid,rid,pack);
 if done->>'stage'<>'DRAFTED' or (select planning_artifact<>'{}'::jsonb or research_artifact<>'{}'::jsonb from public."18_content_pipeline" where pipeline_id=pid) then raise exception 'AUTHORING_DUPLICATE_STORAGE';end if;
 if not (select writer_artifact->'authoringContext'->'planning'=pack->'planning' and writer_artifact->'authoringContext'->'research'=pack->'research' from public."18_content_pipeline" where pipeline_id=pid) then raise exception 'AUTHORING_PACKAGE_STORAGE_FAILED';end if;
 select count(*) into before_images from public."21_content_pipeline_image" where pipeline_id=pid;
 if before_images<>1 or exists(select 1 from public."21_content_pipeline_image" where pipeline_id=pid and (generation_contract_hash is null or generation_contract->'contract_version'<>'5'::jsonb)) then raise exception 'AUTHORING_V5_SYNC_FAILED';end if;
 again:=public.content_pipeline_complete_authoring_supply_v1('qa-source-supply',pid,rid,pack);
 if again->>'replayed'<>'true' or (select count(*) from public."21_content_pipeline_image" where pipeline_id=pid)<>before_images then raise exception 'AUTHORING_COMPLETION_REPLAY_FAILED';end if;
 failed:=false;begin perform public.content_pipeline_complete_authoring_supply_v1('qa-source-supply',pid,rid,pack||jsonb_build_object('planning',jsonb_build_object('changed',true)));exception when others then failed:=true;end;
 if not failed then raise exception 'AUTHORING_CHANGED_REPLAY_ALLOWED';end if;
 if has_function_privilege('anon','public.content_pipeline_claim_authoring_supply_v1(text,uuid,bigint)','execute') or has_function_privilege('authenticated','public.content_pipeline_complete_authoring_supply_v1(text,bigint,bigint,jsonb)','execute') then raise exception 'AUTHORING_PUBLIC_EXECUTE_ALLOWED';end if;

 select pipeline_image_id,generation_contract_hash into imageid,ihash from public."21_content_pipeline_image" where pipeline_id=pid;
 if public.content_pipeline_source_supply_eligible_v1('qa-source-supply',imageid) then raise exception 'MISSING_SUPPLY_WAS_ELIGIBLE';end if;
 if public.content_pipeline_claim_visual_producer_v1('qa-source-supply',imageid) is not null then raise exception 'MISSING_SUPPLY_WAS_CLAIMED';end if;
 si:=jsonb_build_object('contractHash',ihash,'sourceRole','PRODUCTION_INPUT','sourceKind','REAL_SOURCE','sourceAssetUrl','https://example.invalid/rollback-source.jpg','sourcePageUrl','https://example.invalid/rollback','sourceOwner','Rollback fixture only','nativeEditRequired',false,'sourceObservation',jsonb_build_object('expectedSha',repeat('a',64),'pixelsInspected',true,'evidence','Rollback-only protocol fixture; no actual production image QA assertion.'));
 receipt:=public.content_pipeline_prepare_source_supply_v1('qa-source-supply',rid,imageid,extensions.gen_random_uuid(),si);
 sid:=(receipt->>'supplyId')::uuid;
 sp:=jsonb_build_object('storageBucket','content-pipeline-native-handoff','storagePath',(receipt->>'uploadPrefix')||repeat('a',64)||'.jpg','sha256',repeat('a',64),'mimeType','image/jpeg','byteSize',1000,'width',100,'height',100,'decodeVerified',true,'signatureVerified',true);
 failed:=false;begin perform public.content_pipeline_finish_source_supply_v1('wrong-owner',sid,sp);exception when others then failed:=true;end;
 if not failed then raise exception 'SUPPLY_FOREIGN_FINISH_ALLOWED';end if;
 receipt:=public.content_pipeline_finish_source_supply_v1('qa-source-supply',sid,sp);
 if receipt->>'status'<>'READY' or receipt->>'selected'<>'true' or not public.content_pipeline_source_supply_eligible_v1('qa-source-supply',imageid) then raise exception 'SUPPLY_NOT_READY';end if;
 if public.content_pipeline_finish_source_supply_v1('qa-source-supply',sid,sp)->>'replayed'<>'true' then raise exception 'SUPPLY_FINISH_NOT_REPLAYED';end if;
 if has_function_privilege('anon','public.content_pipeline_finish_source_supply_v1(text,uuid,jsonb)','execute') or has_table_privilege('authenticated','public.content_pipeline_visual_supply','insert') then raise exception 'SUPPLY_PUBLIC_WRITE_ALLOWED';end if;
end $qa$;
rollback;
