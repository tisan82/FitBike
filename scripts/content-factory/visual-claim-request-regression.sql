
begin;
do $$
declare a jsonb;b jsonb;c jsonb;req uuid:=extensions.gen_random_uuid();req2 uuid:=extensions.gen_random_uuid();attempts integer;after_attempts integer;token text;
begin
 select attempt_count into attempts from public."21_content_pipeline_image" where pipeline_image_id=1999;
 a:=public.content_pipeline_claim_visual_request_v1('qa-rollback-visual-request',req,1999);
 if a->>'result'<>'CLAIMED' then raise exception 'TEST_NO_CLAIM: %',a->>'result';end if;
 token:=a#>>'{claim,claimToken}';
 b:=public.content_pipeline_claim_visual_request_v1('qa-rollback-visual-request',req,1999);
 if b#>>'{claim,claimToken}' is distinct from token or b->>'replayed'<>'true' then raise exception 'TEST_IDEMPOTENCY_FAILED';end if;
 update public."21_content_pipeline_image" set handoff_phase='STAGING' where pipeline_image_id=1999;
 b:=public.content_pipeline_visual_claim_request_status_v1('qa-rollback-visual-request',req);
 if b->>'activeClaim'<>'true' then raise exception 'TEST_STAGING_NOT_ACTIVE';end if;
 c:=public.content_pipeline_claim_visual_request_v1('qa-rollback-visual-request',req2,1999);
 if c#>>'{claim,claimToken}' is distinct from token then raise exception 'TEST_ACTIVE_RESUME_FAILED';end if;
 select attempt_count into after_attempts from public."21_content_pipeline_image" where pipeline_image_id=1999;
 if not ((c->'claim') ? 'preservedStagingInput') then raise exception 'TEST_RESUME_METADATA_MISSING';end if;
 if after_attempts<>attempts+1 then raise exception 'TEST_DUPLICATE_ATTEMPT';end if;
 begin
  perform public.content_pipeline_claim_visual_request_v1('qa-rollback-visual-request',req,2000);
  raise exception 'TEST_INPUT_CONFLICT_NOT_REJECTED';
 exception when others then if SQLERRM<>'VISUAL_REQUEST_INPUT_CONFLICT' then raise;end if;end;
 perform public.content_pipeline_fail_image_v1(1999,(a#>>'{claim,pipelineImageRunId}')::bigint,token::uuid,'RETRY','TEST','ROLLBACK_TEST','rollback test');
 b:=public.content_pipeline_visual_claim_request_status_v1('qa-rollback-visual-request',req);
 if b->>'result'<>'CLOSED' or b->'claim' ? 'claimToken' then raise exception 'TEST_CLOSED_TOKEN_EXPOSED';end if;
 if exists(select 1 from public."21_content_pipeline_image" where pipeline_image_id=1999 and claim_token is not null) then raise exception 'TEST_CLAIM_NOT_RELEASED';end if;
end $$;
rollback;
