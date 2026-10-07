begin;
do $test$
declare a bigint; b bigint; w text:='claim-lock-test-'||extensions.gen_random_uuid(); r1 uuid:=extensions.gen_random_uuid(); r2 uuid:=extensions.gen_random_uuid(); r3 uuid:=extensions.gen_random_uuid(); x jsonb; y jsonb; z jsonb; token text;
begin
-- Use currently eligible pipeline fixtures; historical 3134/4087 are now COMPLETE.
select min(id),max(id) into a,b from (
 select i.pipeline_image_id id from public."21_content_pipeline_image" i
 join public."18_content_pipeline" p on p.pipeline_id=i.pipeline_id
 where p.ownership_state='CLAIMED' and p.stage in ('DRAFTED','VISUAL')
 and i.status in ('PENDING','RETRY') and i.generation_contract_hash is not null
 and (coalesce((i.generation_contract->>'contract_version')::int,3)<4 or i.generation_contract->'production_feasibility'->>'status'='PASS')
 and not exists(select 1 from public."27_content_pipeline_source_stage_job" j where j.pipeline_image_id=i.pipeline_image_id and j.status in ('PENDING','RUNNING'))
 order by i.pipeline_image_id limit 2
) eligible;
if a is null or b is null or a=b then raise exception 'FIXTURE_MISSING';end if;
update public."21_content_pipeline_image" set status='PENDING',visual_phase=null,review_candidate=null,staging_asset=null,next_eligible_at=null,claim_token=null,claimed_by=null,claim_expires_at=null where pipeline_image_id in(a,b);
x:=public.content_pipeline_claim_visual_request_v1(w,r1,a);
if x->>'activeClaim' is distinct from 'true' then raise exception 'FIRST_CLAIM_FAILED: %',x;end if;
token:=x->'claim'->>'claimToken';
y:=public.content_pipeline_claim_visual_request_v1(w,r2,b);
if y->>'activeClaim' is distinct from 'true' then raise exception 'SECOND_DISTINCT_CLAIM_FAILED: %',y;end if;
if y->'claim'->>'claimToken'=token then raise exception 'TOKEN_REUSED';end if;
z:=public.content_pipeline_claim_visual_request_v1(w,r1,a);
if z->>'activeClaim'<>'true' or z->'claim'->>'claimToken'<>token then raise exception 'REPLAY_FAILED';end if;
z:=public.content_pipeline_claim_visual_request_v1(w,r3,a);
if z->>'reason'<>'TARGET_IMAGE_OWNS_ACTIVE_CLAIM' or z->>'activeClaim'<>'false' then raise exception 'DUPLICATE_NOT_BLOCKED';end if;
z:=public.content_pipeline_claim_visual_request_v1(w||'-other',r3,b);
if z->>'reason'<>'TARGET_IMAGE_OWNS_ACTIVE_CLAIM' then raise exception 'OTHER_WORKER_NOT_BLOCKED';end if;
begin perform public.content_pipeline_fail_visual_request_v1(w,r3,'RETRY','TEST','TEST','test');raise exception 'NON_OWNER_MUTATION_ACCEPTED';exception when others then if sqlerrm<>'ACTIVE_VISUAL_CLAIM_REQUIRED' then raise;end if;end;
if public.content_pipeline_visual_claim_request_status_v1(w,r1)->>'activeClaim'<>'true' or public.content_pipeline_visual_claim_request_status_v1(w,r2)->>'activeClaim'<>'true' then raise exception 'OWNER_CLAIMS_LOST';end if;
end $test$;
rollback;