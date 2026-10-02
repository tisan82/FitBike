-- Add reference-guided generation to the existing candidate lifecycle.
-- No new Image status; generation candidates remain PENDING/RUNNING/STAGED/FAILED.
create or replace function public.content_pipeline_reference_generation_allowed_v1(p_contract jsonb,p_method text)
returns boolean language sql immutable set search_path='' as $$
 select case when p_method='REAL_SOURCE_AI_EDIT' then p_contract->>'ai_edit_allowed'='true'
 when p_method='REFERENCE_BASED_GENERATION' then
   p_contract->>'generation_allowed'='true' and p_contract->>'real_source_required'='false'
   and (p_contract->>'reference_based_generation_allowed'='true' or p_contract->>'source_strategy'='REFERENCE_FIRST_GENERATIVE')
 else false end
$$;
revoke all on function public.content_pipeline_reference_generation_allowed_v1(jsonb,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_reference_generation_allowed_v1(jsonb,text) to service_role;

create or replace function public.content_pipeline_dispatch_visual_generation_request_v1(
 p_worker_key text,p_request_id uuid,p_operation_id uuid,p_spec jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;i public."21_content_pipeline_image"%rowtype;j public."27_content_pipeline_source_stage_job"%rowtype;
 t text;r bigint;v_job uuid;ref jsonb;
begin
 if p_operation_id is null or jsonb_typeof(p_spec) is distinct from 'object' or length(p_spec::text)>14000
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
   or (j.spec-'visualMcpOperation') is distinct from p_spec then raise exception 'VISUAL_GENERATION_INPUT_CONFLICT';end if;
  return public.content_pipeline_source_stage_status_v1(j.job_id)||jsonb_build_object('replayed',true,'operationId',p_operation_id);
 end if;
 if exists(select 1 from public."27_content_pipeline_source_stage_job" where pipeline_image_id=i.pipeline_image_id and status in('PENDING','RUNNING')) then raise exception 'VISUAL_CANDIDATE_ALREADY_RUNNING';end if;
 if not exists(select 1 from public."18_content_pipeline" where pipeline_id=i.pipeline_id and ownership_state='CLAIMED' and stage in('DRAFTED','VISUAL')) then raise exception 'INVALID_PIPELINE_STATE';end if;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public."27_content_pipeline_source_stage_job"(pipeline_image_id,claim_token,contract_hash,spec,token_hash)
 values(i.pipeline_image_id,i.claim_token,i.generation_contract_hash,p_spec||jsonb_build_object('visualMcpOperation',jsonb_build_object('workerKey',p_worker_key,'requestId',p_request_id,'operationId',p_operation_id)),extensions.digest(t,'sha256')) returning job_id into v_job;
 select net.http_post(url:='https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-source-stage',
 headers:=jsonb_build_object('content-type','application/json','x-fitbike-source-stage-ticket',t),body:=jsonb_build_object('jobId',v_job),timeout_milliseconds:=140000) into r;
 update public."27_content_pipeline_source_stage_job" set request_id=r where job_id=v_job;
 return jsonb_build_object('jobId',v_job,'requestId',r,'operationId',p_operation_id,'status','DISPATCHED','replayed',false,'productionMethod',p_spec->>'productionMethod');
end $$;
revoke all on function public.content_pipeline_dispatch_visual_generation_request_v1(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_dispatch_visual_generation_request_v1(text,uuid,uuid,jsonb) to service_role;

-- Generic source ingest must not become an alternative permission-bypass route.
create or replace function public.content_pipeline_dispatch_source_stage_v1(p_spec jsonb,p_pipeline_image_id bigint default null,p_claim_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j uuid;t text;r bigint;i public."21_content_pipeline_image"%rowtype;h text;
begin
 if p_spec ? 'productionMethod' then raise exception 'USE_VISUAL_GENERATION_DISPATCH';end if;
 p_spec:=p_spec - array['rightsStatus','rights_status','rightsEvidence','licenseName','licenseUrl','permissionContact','permissionNote'];
 if jsonb_typeof(p_spec) is distinct from 'object' or length(p_spec::text)>16000 or p_spec->>'sourceAssetUrl' is null or jsonb_typeof(p_spec->'transform') is distinct from 'object' then raise exception 'INVALID_SOURCE_SPEC';end if;
 if (p_pipeline_image_id is null)<>(p_claim_token is null) then raise exception 'INVALID_IMAGE_CLAIM';end if;
 if p_pipeline_image_id is not null then
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id;
 if not found or i.status<>'PROCESSING' or i.handoff_phase is distinct from 'PRODUCING' or i.claim_token is distinct from p_claim_token or i.claim_expires_at<=now() then raise exception 'INVALID_IMAGE_CLAIM';end if;
 if not exists(select 1 from public."18_content_pipeline" p where p.pipeline_id=i.pipeline_id and p.ownership_state='CLAIMED' and p.stage in('DRAFTED','VISUAL')) then raise exception 'INVALID_PIPELINE_STATE';end if;h:=i.generation_contract_hash;
 end if;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public."27_content_pipeline_source_stage_job"(pipeline_image_id,claim_token,contract_hash,spec,token_hash) values(p_pipeline_image_id,p_claim_token,h,p_spec,extensions.digest(t,'sha256')) returning job_id into j;
 select net.http_post(url:='https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-source-stage',headers:=jsonb_build_object('content-type','application/json','x-fitbike-source-stage-ticket',t),body:=jsonb_build_object('jobId',j),timeout_milliseconds:=60000) into r;
 update public."27_content_pipeline_source_stage_job" set request_id=r where job_id=j;
 return jsonb_build_object('jobId',j,'requestId',r,'status','DISPATCHED','probeOnly',p_pipeline_image_id is null);
end $$;
revoke all on function public.content_pipeline_dispatch_source_stage_v1(jsonb,bigint,uuid) from public,anon,authenticated;
grant execute on function public.content_pipeline_dispatch_source_stage_v1(jsonb,bigint,uuid) to service_role;

-- Keep AI-edit input identity and generated recovery binaries inside existing gates.
CREATE OR REPLACE FUNCTION public.content_pipeline_approve_source_stage_v1(p_job_id uuid, p_claim_token uuid, p_expected_sha text, p_qa jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public."27_content_pipeline_source_stage_job"%rowtype;i public."21_content_pipeline_image"%rowtype;a jsonb;role text;
begin
 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 if not found or j.status<>'STAGED' or j.pipeline_image_id is null or j.approved_at is not null or j.result->>'sha256' is distinct from p_expected_sha then raise exception 'SOURCE_STAGE_CANDIDATE_INVALID';end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=j.pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.handoff_phase is distinct from 'PRODUCING' or i.staging_asset is not null or i.claim_token is distinct from p_claim_token or i.claim_expires_at<=now() then raise exception 'INVALID_PRODUCER_CLAIM';end if;
 if not exists(select 1 from public."23_content_pipeline_image_run" where pipeline_image_id=i.pipeline_image_id and claim_token=p_claim_token and status='RUNNING') then raise exception 'IMAGE_RUN_MISSING';end if;
 if i.generation_contract_hash is distinct from j.contract_hash or p_qa->>'contractHash' is distinct from j.contract_hash then raise exception 'CONTRACT_CHANGED';end if;
 role:=upper(coalesce(i.generation_contract->>'asset_role','BODY'));
 if role in('THUMBNAIL','HERO','THUMBNAIL_HERO') and p_qa->>'representativeImageQa' is distinct from 'PASS' then raise exception 'REPRESENTATIVE_QA_REQUIRED';end if;
 if role in('THUMBNAIL','THUMBNAIL_HERO') and p_qa->>'cardCropQa' is distinct from 'PASS' then raise exception 'CARD_CROP_QA_REQUIRED';end if;
 if role in('HERO','THUMBNAIL_HERO') and p_qa->>'heroCropQa' is distinct from 'PASS' then raise exception 'HERO_CROP_QA_REQUIRED';end if;
 a:=j.result||jsonb_build_object('contractHash',j.contract_hash,'qa',p_qa||jsonb_build_object('sourceAssetUrl',coalesce(j.spec->>'sourceAssetUrl',j.spec->>'inputAssetUrl',j.result->'provenance'->>'sourceAssetUrl'),'provenance',j.result->'provenance'),'sourceJobId',j.job_id);
 a:=public.content_pipeline_record_staging_v1(j.pipeline_image_id,p_claim_token,a);
 update public."27_content_pipeline_source_stage_job" set approved_at=now(),updated_at=now() where job_id=j.job_id;
 delete from public."28_content_pipeline_source_stage_inspection_chunk" where job_id=j.job_id;
 return a;
end $function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_staging_cleanup_plan_v1(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with eligible as (
 select o.name as path,o.created_at,o.updated_at,
 case when i.pipeline_image_id is not null then 'VERIFIED_DONE' else 'TERMINAL_CANDIDATE' end as reason,
 i.pipeline_image_id,i.storage_path as "productionPath",i.sha256 as "expectedSha",i.staging_asset->>'bytes' as "expectedBytes"
 from storage.objects o
 left join public."21_content_pipeline_image" i on i.staging_asset->>'path'=o.name and i.staging_asset->>'bucket'='content-pipeline-staging'
 and i.status='DONE' and i.claim_token is null and i.completed_at<now()-interval '24 hours' and i.storage_bucket='content-assets'
 and i.sha256=i.staging_asset->>'sha256' and i.staging_asset->>'storageVerification'='PASS'
 and exists(select 1 from storage.objects po where po.bucket_id='content-assets' and po.name=i.storage_path)
 where o.bucket_id='content-pipeline-staging' and greatest(o.created_at,o.updated_at)<now()-interval '24 hours'
 -- Protect any canonical/in-flight reference, including failed publisher handoffs.
 and not exists(select 1 from public."21_content_pipeline_image" pi where pi.status not in ('DONE','CANCELLED') and
 (pi.staging_asset->>'path'=o.name or pi.staging_input->>'path'=o.name or pi.staging_input->>'stagingPath'=o.name
 or exists(select 1 from public."27_content_pipeline_source_stage_job" sj where sj.pipeline_image_id=pi.pipeline_image_id and o.name in(sj.result->>'path',sj.result->'generatedInput'->>'path'))))
 and not exists(select 1 from public."27_content_pipeline_source_stage_job" sj where o.name in(sj.result->>'path',sj.result->'generatedInput'->>'path') and sj.status in ('PENDING','RUNNING'))
 and (i.pipeline_image_id is not null or (
 not exists(select 1 from public."21_content_pipeline_image" pi where pi.staging_asset->>'path'=o.name or pi.staging_input->>'path'=o.name)
 and exists(select 1 from public."27_content_pipeline_source_stage_job" sj left join public."21_content_pipeline_image" pi on pi.pipeline_image_id=sj.pipeline_image_id
 where o.name in(sj.result->>'path',sj.result->'generatedInput'->>'path') and (sj.result->>'bucket'='content-pipeline-staging' or sj.result->'generatedInput'->>'bucket'='content-pipeline-staging') and sj.status in ('STAGED','FAILED')
 and greatest(sj.created_at,sj.updated_at)<now()-interval '24 hours'
 and (sj.pipeline_image_id is null and o.name like 'probes/'||sj.job_id::text||'/%' or pi.status in ('DONE','CANCELLED')))))
 order by o.created_at,o.name limit least(greatest(p_limit,1),100)
 ) select coalesce(jsonb_agg(eligible),'[]'::jsonb) from eligible;
$function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_guard_staging_cleanup_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p text;
begin
 if new.status not in ('DONE','CANCELLED') then
 for p in select distinct x.path from (
 select new.staging_asset->>'path' as path union select new.staging_input->>'path' union select new.staging_input->>'stagingPath'
 union select result->>'path' from public."27_content_pipeline_source_stage_job" where pipeline_image_id=new.pipeline_image_id
 union select result->'generatedInput'->>'path' from public."27_content_pipeline_source_stage_job" where pipeline_image_id=new.pipeline_image_id
 )x where x.path is not null order by x.path loop
 perform pg_advisory_xact_lock(hashtextextended(p,73100525));
 if exists(select 1 from public.content_pipeline_staging_cleanup_lease where path=p and expires_at>now()) then raise exception 'STAGING_ASSET_CLEANUP_RESERVED';end if;
 end loop;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.content_pipeline_reserve_staging_cleanup_v1(p_run_id uuid, p_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v jsonb;
begin
 if not exists(select 1 from public.content_pipeline_maintenance_run where run_id=p_run_id and status='RUNNING' and dry_run=false and created_at>now()-interval '10 minutes') then raise exception 'INVALID_MAINTENANCE_RUN';end if;
 -- Lock current owners first, then use the same path lock as the activation trigger.
 perform 1 from public."21_content_pipeline_image" i where i.staging_asset->>'path'=p_path or i.staging_input->>'path'=p_path
 or exists(select 1 from public."27_content_pipeline_source_stage_job" j where j.pipeline_image_id=i.pipeline_image_id and p_path in(j.result->>'path',j.result->'generatedInput'->>'path'))
 order by i.pipeline_image_id for update;
 perform pg_advisory_xact_lock(hashtextextended(p_path,73100525));
 select a into v from jsonb_array_elements(public.content_pipeline_staging_cleanup_plan_v1(100)) a where a->>'path'=p_path;
 if v is null then return null;end if;
 insert into public.content_pipeline_staging_cleanup_lease(path,run_id,expires_at) values(p_path,p_run_id,now()+interval '5 minutes')
 on conflict(path) do update set run_id=excluded.run_id,expires_at=excluded.expires_at
 where content_pipeline_staging_cleanup_lease.expires_at<=now() or content_pipeline_staging_cleanup_lease.run_id=p_run_id;
 if not found then return null;end if;
 return v;
end $function$;
