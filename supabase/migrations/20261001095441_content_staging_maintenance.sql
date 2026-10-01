-- Daily private staging maintenance. Storage deletion is exclusively via Storage API.
create table public.content_pipeline_maintenance_run (
 run_id uuid primary key default gen_random_uuid(),
 status text not null default 'DISPATCHED' check(status in ('DISPATCHED','RUNNING','PASS','PARTIAL','FAILED')),
 dry_run boolean not null default false, token_hash bytea not null,
 ticket_expires_at timestamptz not null default now()+interval '5 minutes',
 created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
 request_id bigint, summary jsonb, error text
);
alter table public.content_pipeline_maintenance_run enable row level security;
revoke all on public.content_pipeline_maintenance_run from public,anon,authenticated;
grant all on public.content_pipeline_maintenance_run to service_role;

-- A short lease serializes deletion with image activation/approval/rework.
create table public.content_pipeline_staging_cleanup_lease (
 path text primary key,run_id uuid not null references public.content_pipeline_maintenance_run(run_id),
 expires_at timestamptz not null
);
alter table public.content_pipeline_staging_cleanup_lease enable row level security;
revoke all on public.content_pipeline_staging_cleanup_lease from public,anon,authenticated;
grant all on public.content_pipeline_staging_cleanup_lease to service_role;

create function public.content_pipeline_guard_staging_cleanup_v1() returns trigger
language plpgsql security definer set search_path='' as $$
declare p text;
begin
 if new.status not in ('DONE','CANCELLED') then
 for p in select distinct x.path from (
 select new.staging_asset->>'path' as path union select new.staging_input->>'path' union select new.staging_input->>'stagingPath'
 union select result->>'path' from public."27_content_pipeline_source_stage_job" where pipeline_image_id=new.pipeline_image_id
 )x where x.path is not null order by x.path loop
 perform pg_advisory_xact_lock(hashtextextended(p,73100525));
 if exists(select 1 from public.content_pipeline_staging_cleanup_lease where path=p and expires_at>now()) then raise exception 'STAGING_ASSET_CLEANUP_RESERVED';end if;
 end loop;
 end if;
 return new;
end $$;
create trigger guard_staging_cleanup before insert or update of status,staging_asset,staging_input on public."21_content_pipeline_image"
for each row execute function public.content_pipeline_guard_staging_cleanup_v1();

create function public.content_pipeline_storage_usage_v1() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('checkedAt',now(),'databaseBytes',pg_database_size(current_database()),
 'storageBytes',(select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end),0) from storage.objects),
 'buckets',(select coalesce(jsonb_agg(x),'[]'::jsonb) from (select bucket_id,count(*) as objects,
 sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end) as bytes from storage.objects group by bucket_id order by bucket_id)x),
 'inspectionChunkBytes',(select coalesce(sum(octet_length(chunk_base64)),0) from public."28_content_pipeline_source_stage_inspection_chunk"),
 'scope','Storage metadata inventory and physical database size; not monthly billing/egress/function quota');
$$;

create function public.content_pipeline_staging_cleanup_plan_v1(p_limit integer default 100) returns jsonb
language sql security definer set search_path='' as $$
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
 or exists(select 1 from public."27_content_pipeline_source_stage_job" sj where sj.pipeline_image_id=pi.pipeline_image_id and sj.result->>'path'=o.name)))
 and not exists(select 1 from public."27_content_pipeline_source_stage_job" sj where sj.result->>'path'=o.name and sj.status in ('PENDING','RUNNING'))
 and (i.pipeline_image_id is not null or (
 not exists(select 1 from public."21_content_pipeline_image" pi where pi.staging_asset->>'path'=o.name or pi.staging_input->>'path'=o.name)
 and exists(select 1 from public."27_content_pipeline_source_stage_job" sj left join public."21_content_pipeline_image" pi on pi.pipeline_image_id=sj.pipeline_image_id
 where sj.result->>'path'=o.name and sj.result->>'bucket'='content-pipeline-staging' and sj.status in ('STAGED','FAILED')
 and greatest(sj.created_at,sj.updated_at)<now()-interval '24 hours'
 and (sj.pipeline_image_id is null and o.name like 'probes/'||sj.job_id::text||'/%' or pi.status in ('DONE','CANCELLED')))))
 order by o.created_at,o.name limit least(greatest(p_limit,1),100)
 ) select coalesce(jsonb_agg(eligible),'[]'::jsonb) from eligible;
$$;

create function public.content_pipeline_reserve_staging_cleanup_v1(p_run_id uuid,p_path text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 if not exists(select 1 from public.content_pipeline_maintenance_run where run_id=p_run_id and status='RUNNING' and dry_run=false and created_at>now()-interval '10 minutes') then raise exception 'INVALID_MAINTENANCE_RUN';end if;
 -- Lock current owners first, then use the same path lock as the activation trigger.
 perform 1 from public."21_content_pipeline_image" i where i.staging_asset->>'path'=p_path or i.staging_input->>'path'=p_path
 or exists(select 1 from public."27_content_pipeline_source_stage_job" j where j.pipeline_image_id=i.pipeline_image_id and j.result->>'path'=p_path)
 order by i.pipeline_image_id for update;
 perform pg_advisory_xact_lock(hashtextextended(p_path,73100525));
 select a into v from jsonb_array_elements(public.content_pipeline_staging_cleanup_plan_v1(100)) a where a->>'path'=p_path;
 if v is null then return null;end if;
 insert into public.content_pipeline_staging_cleanup_lease(path,run_id,expires_at) values(p_path,p_run_id,now()+interval '5 minutes')
 on conflict(path) do update set run_id=excluded.run_id,expires_at=excluded.expires_at
 where content_pipeline_staging_cleanup_lease.expires_at<=now() or content_pipeline_staging_cleanup_lease.run_id=p_run_id;
 if not found then return null;end if;
 return v;
end $$;

create function public.content_pipeline_consume_maintenance_ticket_v1(p_run_id uuid,p_ticket text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.content_pipeline_maintenance_run%rowtype;
begin
 update public.content_pipeline_maintenance_run set status='RUNNING',started_at=now()
 where run_id=p_run_id and status='DISPATCHED' and ticket_expires_at>now()
 and token_hash=extensions.digest(p_ticket,'sha256') returning * into r;
 if not found then return null;end if;
 return jsonb_build_object('runId',r.run_id,'dryRun',r.dry_run);
end $$;

create function public.content_pipeline_dispatch_staging_maintenance_v1(p_dry_run boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j uuid;t text;r bigint;
begin
 if not pg_try_advisory_xact_lock(73100524) then return jsonb_build_object('status','SKIP','reason','MAINTENANCE_BUSY');end if;
 update public.content_pipeline_maintenance_run set status='FAILED',completed_at=now(),error='MAINTENANCE_DEADLINE_EXCEEDED'
 where status in ('DISPATCHED','RUNNING') and created_at<now()-interval '10 minutes';
 if exists(select 1 from public.content_pipeline_maintenance_run where status in ('DISPATCHED','RUNNING')) then
 return jsonb_build_object('status','SKIP','reason','MAINTENANCE_BUSY');end if;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.content_pipeline_maintenance_run(dry_run,token_hash) values(p_dry_run,extensions.digest(t,'sha256')) returning run_id into j;
 select net.http_post(url:='https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-staging-maintenance',
 headers:=jsonb_build_object('content-type','application/json','x-fitbike-maintenance-ticket',t),body:=jsonb_build_object('runId',j),timeout_milliseconds:=120000) into r;
 update public.content_pipeline_maintenance_run set request_id=r where run_id=j;
 return jsonb_build_object('runId',j,'requestId',r,'status','DISPATCHED','dryRun',p_dry_run);
end $$;

create function public.content_pipeline_finish_staging_maintenance_v1(p_run_id uuid,p_summary jsonb,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.content_pipeline_maintenance_run%rowtype;
begin
 if p_status not in ('PASS','PARTIAL','FAILED') then raise exception 'INVALID_MAINTENANCE_STATUS';end if;
 update public.content_pipeline_maintenance_run set status=p_status,summary=p_summary,completed_at=now() where run_id=p_run_id and status='RUNNING' returning * into r;
 if not found then raise exception 'MAINTENANCE_RECEIPT_NOT_SAVED';end if;
 delete from public.content_pipeline_staging_cleanup_lease where run_id=p_run_id;
 return jsonb_build_object('runId',r.run_id,'status',r.status);
end $$;

-- Called only after a live run and Storage processing. Never delete Job/QA/provenance records.
create function public.content_pipeline_cleanup_inspection_chunks_v1(p_run_id uuid) returns bigint
language plpgsql security definer set search_path='' as $$
declare n bigint;
begin
 if not exists(select 1 from public.content_pipeline_maintenance_run where run_id=p_run_id and status='RUNNING' and dry_run=false and created_at>now()-interval '10 minutes') then raise exception 'INVALID_MAINTENANCE_RUN';end if;
 delete from public."28_content_pipeline_source_stage_inspection_chunk" c using public."27_content_pipeline_source_stage_job" j
 where c.job_id=j.job_id and not exists(select 1 from storage.objects o where o.bucket_id='content-pipeline-staging' and o.name=j.result->>'path') and j.status in ('STAGED','FAILED') and greatest(j.created_at,j.updated_at)<now()-interval '24 hours'
 and (j.pipeline_image_id is null or exists(select 1 from public."21_content_pipeline_image" i where i.pipeline_image_id=j.pipeline_image_id and i.status in ('DONE','CANCELLED') and i.claim_token is null));
 get diagnostics n=row_count;return n;
end $$;

-- Expose only aggregate results to the privileged operator/server, never ticket hashes.
create function public.content_pipeline_staging_maintenance_status_v1() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('usage',public.content_pipeline_storage_usage_v1(),
 'latestRuns',(select coalesce(jsonb_agg(r),'[]'::jsonb) from (select run_id,status,dry_run,created_at,completed_at,request_id,summary,error from public.content_pipeline_maintenance_run order by created_at desc limit 10)r),
 'schedule',(select jsonb_agg(jsonb_build_object('schedule',schedule,'active',active)) from cron.job where jobname='fitbike-daily-staging-maintenance'));
$$;

do $$declare f record;begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('content_pipeline_guard_staging_cleanup_v1','content_pipeline_reserve_staging_cleanup_v1','content_pipeline_storage_usage_v1','content_pipeline_staging_cleanup_plan_v1','content_pipeline_consume_maintenance_ticket_v1','content_pipeline_dispatch_staging_maintenance_v1','content_pipeline_finish_staging_maintenance_v1','content_pipeline_cleanup_inspection_chunks_v1','content_pipeline_staging_maintenance_status_v1') loop
 execute 'revoke all on function '||f.signature||' from public,anon,authenticated';execute 'grant execute on function '||f.signature||' to service_role';end loop;
end $$;
-- 01:10 Asia/Seoul daily. pg_cron schedules in UTC.
select cron.schedule('fitbike-daily-staging-maintenance','10 16 * * *','select public.content_pipeline_dispatch_staging_maintenance_v1(false);');
