create or replace function public.content_pipeline_visual_claim_request_status_v1(p_worker_key text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public."29_content_pipeline_visual_claim_request"%rowtype; i public."21_content_pipeline_image"%rowtype; active boolean;
begin
 select * into r from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
 if not found then return jsonb_build_object('requestId',p_request_id,'result','NOT_FOUND');end if;
 if r.pipeline_image_id is null then return jsonb_build_object('requestId',p_request_id,'result','SKIP','claim',null);end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=r.pipeline_image_id;
 active:=i.status='PROCESSING' and i.handoff_phase in ('PRODUCING','STAGING') and i.claimed_by=p_worker_key and i.claim_token::text=r.response->>'claimToken' and i.claim_expires_at>now();
 return jsonb_build_object('requestId',p_request_id,'result',case when active then 'CLAIMED' when i.status='PROCESSING' then 'CLAIM_INACTIVE' else 'CLOSED' end,
 'status',i.status,'handoffPhase',i.handoff_phase,'claimExpiresAt',i.claim_expires_at,'activeClaim',coalesce(active,false),
 'claim',case when active then r.response else r.response-'claimToken' end);
end $$;

create or replace function public.content_pipeline_claim_visual_request_v1(p_worker_key text,p_request_id uuid,p_pipeline_image_id bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public."29_content_pipeline_visual_claim_request"%rowtype; i public."21_content_pipeline_image"%rowtype; response jsonb; run_id bigint;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 or p_request_id is null then raise exception 'INVALID_VISUAL_REQUEST';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visual-request:'||p_worker_key,0));
 select * into r from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id;
 if found then
  if r.target_image_id is distinct from p_pipeline_image_id then raise exception 'VISUAL_REQUEST_INPUT_CONFLICT';end if;
  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object('replayed',true);
 end if;
 select * into i from public."21_content_pipeline_image" where claimed_by=p_worker_key and status='PROCESSING' and claim_expires_at>now() order by pipeline_image_id limit 1 for update;
 if found then
  if i.handoff_phase not in ('PRODUCING','STAGING') or i.handoff_phase is null then raise exception 'VISUAL_WORKER_ALREADY_PROCESSING';end if;
  if p_pipeline_image_id is not null and p_pipeline_image_id<>i.pipeline_image_id then raise exception 'VISUAL_WORKER_ALREADY_CLAIMED';end if;
  select pipeline_image_run_id into run_id from public."23_content_pipeline_image_run" where pipeline_image_id=i.pipeline_image_id and claim_token=i.claim_token and status='RUNNING' order by pipeline_image_run_id desc limit 1;
  if run_id is null then raise exception 'VISUAL_ACTIVE_RUN_MISSING';end if;
  response:=jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineId',i.pipeline_id,'pipelineImageRunId',run_id,'claimToken',i.claim_token,
  'imageId',i.image_id,'assetKey',i.asset_key,'generationContract',i.generation_contract,'generationContractHash',i.generation_contract_hash,'claimExpiresAt',i.claim_expires_at,
  'contentKey',(select content_key from public."18_content_pipeline" where pipeline_id=i.pipeline_id),'topicKey',(select topic_key from public."18_content_pipeline" where pipeline_id=i.pipeline_id),'ordinal',i.ordinal,'attemptNo',i.attempt_count,
  'preservedStagingInput',case when i.staging_input->>'contractHash'=i.generation_contract_hash then i.staging_input else null end,'resumedExistingClaim',true);
 else
  response:=public.content_pipeline_claim_visual_producer_v1(p_worker_key,p_pipeline_image_id);
 end if;
 insert into public."29_content_pipeline_visual_claim_request"(worker_key,request_id,target_image_id,pipeline_image_id,response)
 values(p_worker_key,p_request_id,p_pipeline_image_id,(response->>'pipelineImageId')::bigint,response);
 return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)||jsonb_build_object('replayed',false);
end $$;
