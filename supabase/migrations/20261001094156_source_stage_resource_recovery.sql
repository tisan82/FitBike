-- Reconcile terminated workers from pg_net receipts without changing Image/Claim/QA.
-- 2-minute timedOut is advisory only; transport failure or a 10-minute server deadline is terminal.
create or replace function public.content_pipeline_source_stage_status_v1(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 j public."27_content_pipeline_source_stage_job"%rowtype;
 r net._http_response%rowtype;
 code text; payload jsonb; transport jsonb;
begin
 select * into j from public."27_content_pipeline_source_stage_job" where job_id=p_job_id for update;
 if not found then return null; end if;
 select * into r from net._http_response where id=j.request_id;
 transport:=jsonb_build_object('httpStatus',r.status_code,'timedOut',r.timed_out,'responseAvailable',r.id is not null);
 if j.status in ('PENDING','RUNNING') then
   if r.status_code>=400 and coalesce(r.timed_out,false)=false then
     begin payload:=r.content::jsonb; exception when others then payload:='{}'::jsonb; end;
     code:=case when r.status_code=546 then 'WORKER_RESOURCE_LIMIT'
       when payload->>'error' ~ '^[A-Z][A-Z0-9_]{0,199}$' then payload->>'error'
       when payload->>'code' ~ '^[A-Z][A-Z0-9_]{0,199}$' then payload->>'code'
       else 'SOURCE_STAGE_HTTP_'||r.status_code::text end;
   elsif j.created_at<now()-interval '10 minutes' then
     -- A network timeout alone doesn't prove the worker stopped. Wait for the
     -- server deadline, fence receipt writes, and preserve any storage checkpoint.
     code:='SOURCE_STAGE_DEADLINE_EXCEEDED';
   end if;
   if code is not null then
     update public."27_content_pipeline_source_stage_job"
       set status='FAILED',failure_code=code,
           result=coalesce(result,'{}'::jsonb)||jsonb_build_object('transportFailure',transport),updated_at=now()
       where job_id=j.job_id and status in ('PENDING','RUNNING') returning * into j;
   end if;
 end if;
 return jsonb_build_object('jobId',j.job_id,'probeOnly',j.pipeline_image_id is null,
  'pipelineImageId',j.pipeline_image_id,'status',j.status,'result',j.result,
  'failureCode',j.failure_code,'requestId',j.request_id,'createdAt',j.created_at,'updatedAt',j.updated_at,
  'timedOut',j.status in ('PENDING','RUNNING') and j.created_at<now()-interval '2 minutes',
  'transport',transport,'pollAfterSeconds',case when j.status in ('PENDING','RUNNING') then 5 else null end,
  'nextAction',case when j.status='STAGED' then 'INSPECT_STAGED_PIXELS' when j.status='FAILED' then 'REVIEW_FAILURE_SELECT_ALTERNATIVE' else 'POLL_SAME_JOB' end);
end $$;
revoke all on function public.content_pipeline_source_stage_status_v1(uuid) from public,anon,authenticated;
grant execute on function public.content_pipeline_source_stage_status_v1(uuid) to service_role;
