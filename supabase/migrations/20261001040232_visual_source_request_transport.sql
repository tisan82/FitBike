-- Service-only, one candidate per operationId; delegates existing URL/file/ticket guards.
create or replace function public.content_pipeline_dispatch_visual_source_request_v1(
 p_worker_key text,p_request_id uuid,p_operation_id uuid,p_spec jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;j public."27_content_pipeline_source_stage_job"%rowtype;d jsonb;meta jsonb;
begin
 if p_operation_id is null or jsonb_typeof(p_spec) is distinct from 'object' then raise exception 'INVALID_SOURCE_REQUEST';end if;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 if c->>'handoffPhase' is distinct from 'PRODUCING' then raise exception 'PRODUCING_CLAIM_REQUIRED';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visual-source:'||p_worker_key||':'||p_operation_id::text,0));
 -- Lock the image to serialize dispatch against approval/failure/expiry recovery.
 perform 1 from public."21_content_pipeline_image" where pipeline_image_id=(c->'claim'->>'pipelineImageId')::bigint for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' or c->>'handoffPhase' is distinct from 'PRODUCING' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 select * into j from public."27_content_pipeline_source_stage_job"
 where spec->'visualMcpOperation'->>'workerKey'=p_worker_key and spec->'visualMcpOperation'->>'operationId'=p_operation_id::text
 order by created_at desc limit 1;
 if found then
  if j.pipeline_image_id is distinct from (c->'claim'->>'pipelineImageId')::bigint or j.contract_hash is distinct from c->'claim'->>'generationContractHash'
   or (j.spec-'visualMcpOperation') is distinct from p_spec then raise exception 'VISUAL_SOURCE_INPUT_CONFLICT';end if;
  return public.content_pipeline_source_stage_status_v1(j.job_id)||jsonb_build_object('replayed',true,'operationId',p_operation_id);
 end if;
 meta:=jsonb_build_object('workerKey',p_worker_key,'requestId',p_request_id,'operationId',p_operation_id);
 d:=public.content_pipeline_dispatch_source_stage_v1(p_spec||jsonb_build_object('visualMcpOperation',meta),
 (c->'claim'->>'pipelineImageId')::bigint,(c->'claim'->>'claimToken')::uuid);
 return d||jsonb_build_object('replayed',false,'operationId',p_operation_id);
end $$;
revoke all on function public.content_pipeline_dispatch_visual_source_request_v1(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_dispatch_visual_source_request_v1(text,uuid,uuid,jsonb) to service_role;
