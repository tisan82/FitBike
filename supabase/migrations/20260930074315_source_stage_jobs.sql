-- Additive server URL/PDF transport. Probe jobs never claim/mutate content.
create table public."27_content_pipeline_source_stage_job" (
 job_id uuid primary key default gen_random_uuid(), pipeline_image_id bigint references public."21_content_pipeline_image"(pipeline_image_id), claim_token uuid, contract_hash text,
 spec jsonb not null, status text not null default 'PENDING' check(status in('PENDING','RUNNING','STAGED','FAILED')),
 token_hash bytea not null, ticket_expires_at timestamptz not null default now()+interval '5 minutes',consumed_at timestamptz,request_id bigint,
 result jsonb,failure_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public."27_content_pipeline_source_stage_job" enable row level security;
revoke all on public."27_content_pipeline_source_stage_job" from public,anon,authenticated;
grant all on public."27_content_pipeline_source_stage_job" to service_role;
create index source_stage_job_image_idx on public."27_content_pipeline_source_stage_job"(pipeline_image_id,created_at desc);
create function public.content_pipeline_dispatch_source_stage_v1(p_spec jsonb,p_pipeline_image_id bigint default null,p_claim_token uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j uuid;t text;r bigint;i public."21_content_pipeline_image"%rowtype;h text;
begin
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
create function public.content_pipeline_consume_source_stage_ticket_v1(p_job_id uuid,p_ticket text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public."27_content_pipeline_source_stage_job"%rowtype;
begin
 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 if not found or j.status<>'PENDING' or j.consumed_at is not null or j.ticket_expires_at<=now() or j.token_hash is distinct from extensions.digest(p_ticket,'sha256') then raise exception 'SOURCE_STAGE_TICKET_INVALID';end if;
 if j.pipeline_image_id is not null and not exists(select 1 from public."21_content_pipeline_image" i join public."18_content_pipeline" p on p.pipeline_id=i.pipeline_id where i.pipeline_image_id=j.pipeline_image_id and i.claim_token=j.claim_token and i.status='PROCESSING' and i.handoff_phase='PRODUCING' and i.claim_expires_at>now() and i.generation_contract_hash=j.contract_hash and p.ownership_state='CLAIMED' and p.stage in('DRAFTED','VISUAL')) then raise exception 'INVALID_IMAGE_CLAIM';end if;
 update public."27_content_pipeline_source_stage_job" set status='RUNNING',consumed_at=now(),updated_at=now() where job_id=p_job_id;
 return jsonb_build_object('jobId',j.job_id,'spec',j.spec,'pipelineImageId',j.pipeline_image_id,'contractHash',j.contract_hash,'pipelineId',(select pipeline_id from public."21_content_pipeline_image" where pipeline_image_id=j.pipeline_image_id));
end $$;
create function public.content_pipeline_source_stage_status_v1(p_job_id uuid)
returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('jobId',job_id,'probeOnly',pipeline_image_id is null,'pipelineImageId',pipeline_image_id,'status',status,'result',result,'failureCode',failure_code,'requestId',request_id,'createdAt',created_at,'updatedAt',updated_at,'timedOut',status in('PENDING','RUNNING') and created_at<now()-interval '2 minutes') from public."27_content_pipeline_source_stage_job" where job_id=p_job_id
$$;
-- A probe cannot be approved. Real candidates need explicit pixel/SEO QA.
create function public.content_pipeline_approve_source_stage_v1(p_job_id uuid,p_claim_token uuid,p_expected_sha text,p_qa jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public."27_content_pipeline_source_stage_job"%rowtype;i public."21_content_pipeline_image"%rowtype;a jsonb;role text;
begin
 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id;
 if not found or j.status<>'STAGED' or j.pipeline_image_id is null or j.result->>'sha256' is distinct from p_expected_sha then raise exception 'SOURCE_STAGE_CANDIDATE_INVALID';end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=j.pipeline_image_id;
 if i.generation_contract_hash is distinct from j.contract_hash or p_qa->>'contractHash' is distinct from j.contract_hash then raise exception 'CONTRACT_CHANGED';end if;
 role:=upper(coalesce(i.generation_contract->>'asset_role','BODY'));
 if role in('THUMBNAIL','HERO','THUMBNAIL_HERO') and p_qa->>'representativeImageQa' is distinct from 'PASS' then raise exception 'REPRESENTATIVE_QA_REQUIRED';end if;
 if role in('THUMBNAIL','THUMBNAIL_HERO') and p_qa->>'cardCropQa' is distinct from 'PASS' then raise exception 'CARD_CROP_QA_REQUIRED';end if;
 if role in('HERO','THUMBNAIL_HERO') and p_qa->>'heroCropQa' is distinct from 'PASS' then raise exception 'HERO_CROP_QA_REQUIRED';end if;
 a:=j.result||jsonb_build_object('contractHash',j.contract_hash,'qa',p_qa||jsonb_build_object('sourceAssetUrl',j.spec->>'sourceAssetUrl','provenance',j.result->'provenance'),'sourceJobId',j.job_id);
 return public.content_pipeline_record_staging_v1(j.pipeline_image_id,p_claim_token,a);
end $$;
do $$declare f record;begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in('content_pipeline_dispatch_source_stage_v1','content_pipeline_consume_source_stage_ticket_v1','content_pipeline_source_stage_status_v1','content_pipeline_approve_source_stage_v1') loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated';execute 'grant execute on function '||f.signature||' to service_role';end loop;end $$;
