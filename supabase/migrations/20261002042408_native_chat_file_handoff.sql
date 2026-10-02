-- Remove server model generation. Retain existing image records, contracts and recovery inputs.
-- Native files use the same operator/Contract/job gates; ephemeral URLs are not input identity.
create or replace function public.content_pipeline_native_file_identity_v1(p_spec jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select (p_spec - array['chatFile','inputFile'])
 || case when p_spec ? 'chatFile' then jsonb_build_object('chatFile',(p_spec->'chatFile')-'download_url') else '{}'::jsonb end
 || case when p_spec ? 'inputFile' then jsonb_build_object('inputFile',(p_spec->'inputFile')-'download_url') else '{}'::jsonb end
$$;
revoke all on function public.content_pipeline_native_file_identity_v1(jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_native_file_identity_v1(jsonb) to service_role;

create or replace function public.content_pipeline_dispatch_visual_generation_request_v1(
 p_worker_key text,p_request_id uuid,p_operation_id uuid,p_spec jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;i public."21_content_pipeline_image"%rowtype;j public."27_content_pipeline_source_stage_job"%rowtype;
 t text;r bigint;v_job uuid;ref jsonb;
begin
 if p_operation_id is null or jsonb_typeof(p_spec) is distinct from 'object' or length(p_spec::text)>24000
 or coalesce(p_spec->>'productionMethod','') not in ('REFERENCE_BASED_GENERATION','REAL_SOURCE_AI_EDIT')
 or length(coalesce(p_spec->>'prompt','')) not between 20 and 6000
 or jsonb_typeof(p_spec->'transform') is distinct from 'object'
 or jsonb_typeof(p_spec->'references') is distinct from 'array' then raise exception 'INVALID_GENERATION_SPEC';end if;
 if jsonb_array_length(p_spec->'references') not between 1 and 4 then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;
 for ref in select value from jsonb_array_elements(p_spec->'references') loop
   if ref->>'pixelsInspected' is distinct from 'true' or length(coalesce(ref->>'sourceOwner','')) not between 1 and 200
    or coalesce(ref->>'sourcePageUrl','') !~ '^https://' or jsonb_typeof(ref->'verifiedFacts') is distinct from 'array'
    or nullif(ref->>'checkedAt','') is null then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;
   if jsonb_array_length(ref->'verifiedFacts') not between 1 and 10 then raise exception 'VERIFIED_REFERENCE_EVIDENCE_REQUIRED';end if;
 end loop;
 if not (p_spec ? 'chatFile' or p_spec ? 'generatedAssetUrl' or p_spec ? 'resumeJobId') then raise exception 'NATIVE_GENERATED_FILE_REQUIRED';end if;
 if p_spec ? 'chatFile' and (p_spec ? 'generatedAssetUrl' or p_spec ? 'resumeJobId') then raise exception 'MULTIPLE_GENERATED_INPUTS';end if;
 if p_spec ? 'chatFile' and (jsonb_typeof(p_spec->'chatFile') is distinct from 'object' or nullif(p_spec->'chatFile'->>'file_id','') is null or coalesce(p_spec->'chatFile'->>'download_url','') !~ '^https://') then raise exception 'INVALID_CHAT_FILE';end if;
 if p_spec->>'productionMethod'='REAL_SOURCE_AI_EDIT' and not (p_spec ? 'resumeJobId') and not (p_spec ? 'inputFile') then raise exception 'NATIVE_EDIT_INPUT_FILE_REQUIRED';end if;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' or c->>'handoffPhase' is distinct from 'PRODUCING' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visual-source:'||p_worker_key||':'||p_operation_id::text,0));
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=(c->'claim'->>'pipelineImageId')::bigint for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' or c->>'handoffPhase' is distinct from 'PRODUCING'
 or i.generation_contract_hash is distinct from c->'claim'->>'generationContractHash' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED';end if;
 if public.content_pipeline_reference_generation_allowed_v1(i.generation_contract,p_spec->>'productionMethod') is distinct from true then raise exception 'REFERENCE_GENERATION_CONTRACT_NOT_ALLOWED';end if;
 select * into j from public."27_content_pipeline_source_stage_job"
 where spec->'visualMcpOperation'->>'workerKey'=p_worker_key and spec->'visualMcpOperation'->>'operationId'=p_operation_id::text
 order by created_at desc limit 1;
 if found then
  if j.pipeline_image_id is distinct from i.pipeline_image_id or j.contract_hash is distinct from i.generation_contract_hash
   or public.content_pipeline_native_file_identity_v1(j.spec-'visualMcpOperation') is distinct from public.content_pipeline_native_file_identity_v1(p_spec) then raise exception 'VISUAL_GENERATION_INPUT_CONFLICT';end if;
  return public.content_pipeline_source_stage_status_v1(j.job_id)||jsonb_build_object('replayed',true,'operationId',p_operation_id);
 end if;
 if exists(select 1 from public."27_content_pipeline_source_stage_job" where pipeline_image_id=i.pipeline_image_id and status in('PENDING','RUNNING')) then raise exception 'VISUAL_CANDIDATE_ALREADY_RUNNING';end if;
 if not exists(select 1 from public."18_content_pipeline" where pipeline_id=i.pipeline_id and ownership_state='CLAIMED' and stage in('DRAFTED','VISUAL')) then raise exception 'INVALID_PIPELINE_STATE';end if;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public."27_content_pipeline_source_stage_job"(pipeline_image_id,claim_token,contract_hash,spec,token_hash)
 values(i.pipeline_image_id,i.claim_token,i.generation_contract_hash,p_spec||jsonb_build_object('visualMcpOperation',jsonb_build_object('workerKey',p_worker_key,'requestId',p_request_id,'operationId',p_operation_id)),extensions.digest(t,'sha256')) returning job_id into v_job;
 select net.http_post(url:='https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-source-stage',
 headers:=jsonb_build_object('content-type','application/json','x-fitbike-source-stage-ticket',t),body:=jsonb_build_object('jobId',v_job),timeout_milliseconds:=60000) into r;
 update public."27_content_pipeline_source_stage_job" set request_id=r where job_id=v_job;
 return jsonb_build_object('jobId',v_job,'requestId',r,'operationId',p_operation_id,'status','DISPATCHED','replayed',false,'productionMethod',p_spec->>'productionMethod');
end $$;
revoke all on function public.content_pipeline_dispatch_visual_generation_request_v1(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_dispatch_visual_generation_request_v1(text,uuid,uuid,jsonb) to service_role;
