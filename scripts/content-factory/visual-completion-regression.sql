begin;
do $test$
declare b jsonb := '{"must_show":["starter button"],"must_not_show":["warning light"],"production_feasibility":{"status":"PASS","single_source_satisfiable":true,"mobile_single_question":true},"production_flexibility":{}}'; r jsonb; i public."21_content_pipeline_image"%rowtype; c jsonb;
begin
 r:=public.content_pipeline_validate_image_brief_feasibility_v1(b);
 if r->>'status'<>'PASS' then raise exception 'BASE_BRIEF_REJECTED: %',r;end if;
 r:=public.content_pipeline_validate_image_brief_feasibility_v1(b||'{"must_not_show":[" STARTER BUTTON "]}');
 if not (r->'reasons') ? 'MUST_SHOW_FORBIDDEN_CONTRADICTION' then raise exception 'CONTRADICTION_NOT_REJECTED';end if;
 b:=b||'{"production_source_required":true,"production_flexibility":{"exact_source_required":true}}';
 r:=public.content_pipeline_validate_image_brief_feasibility_v1(b);
 if not (r->'reasons') ? 'EXACT_SOURCE_EVIDENCE_REQUIRED' then raise exception 'SOURCE_EVIDENCE_NOT_REQUIRED';end if;
 b:=jsonb_set(b,'{production_feasibility}',b->'production_feasibility'||'{"source_evidence_url":"https://manufacturer.example/manual","source_evidence_verified":true}');
 if public.content_pipeline_validate_image_brief_feasibility_v1(b)->>'status'<>'PASS' then raise exception 'VERIFIED_SOURCE_REJECTED';end if;
 -- Real claim under a transaction. All receipt/lease/sync changes roll back.
 c:=public.content_pipeline_claim_visual_producer_v1('visual-completion-regression');
 if c is not null then
  select * into i from public."21_content_pipeline_image" where pipeline_image_id=(c->>'pipelineImageId')::bigint;
  if exists(select 1 from public."21_content_pipeline_image" x join public."18_content_pipeline" p on p.pipeline_id=x.pipeline_id
    where x.pipeline_image_id<>i.pipeline_image_id and p.ownership_state='CLAIMED' and p.stage in ('DRAFTED','VISUAL')
    and x.status in ('PENDING','RETRY') and x.staging_asset is null
    and (x.status<>'RETRY' or coalesce(x.next_eligible_at,'-infinity')<=now())
    and public.content_pipeline_visual_recovery_v1(x.pipeline_image_id) is not null)
    and public.content_pipeline_visual_recovery_v1(i.pipeline_image_id) is null
    then raise exception 'STAGED_RECOVERY_NOT_PRIORITIZED';end if;
  update public."21_content_pipeline_image" set status='HOLD',claimed_by=null,claim_token=null,claim_expires_at=null where pipeline_image_id=i.pipeline_image_id;
  if public.content_pipeline_claim_visual_producer_v1('visual-completion-regression',i.pipeline_image_id) is not null then raise exception 'HOLD_BYPASSED';end if;
  update public."21_content_pipeline_image" set status='RETRY',next_eligible_at=now()+interval '1 day' where pipeline_image_id=i.pipeline_image_id;
  if public.content_pipeline_claim_visual_producer_v1('visual-completion-regression',i.pipeline_image_id) is not null then raise exception 'COOLDOWN_BYPASSED';end if;
 end if;
end $test$;
rollback;
