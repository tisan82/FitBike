begin;
do $test$
declare a bigint; b bigint; w text:='claim-lock-test-'||extensions.gen_random_uuid(); r1 uuid:=extensions.gen_random_uuid(); r2 uuid:=extensions.gen_random_uuid(); r3 uuid:=extensions.gen_random_uuid(); x jsonb; y jsonb; z jsonb; token text;
begin
select pipeline_image_id into a from public."21_content_pipeline_image" where pipeline_image_id=3134;
select pipeline_image_id into b from public."21_content_pipeline_image" where pipeline_image_id=4087;
if a is null or b is null then raise exception 'FIXTURE_MISSING';end if;
update public."21_content_pipeline_image" set status='PENDING',staging_asset=null,next_eligible_at=null,claim_token=null,claimed_by=null,claim_expires_at=null where pipeline_image_id in(a,b);
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