-- Keep deletion leases on ambiguous Storage failures until expiry.
create or replace function public.content_pipeline_finish_staging_maintenance_v1(p_run_id uuid,p_summary jsonb,p_status text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.content_pipeline_maintenance_run%rowtype;
begin
 if p_status not in ('PASS','PARTIAL','FAILED') then raise exception 'INVALID_MAINTENANCE_STATUS';end if;
 update public.content_pipeline_maintenance_run set status=p_status,summary=p_summary,completed_at=now() where run_id=p_run_id and status='RUNNING' returning * into r;
 if not found then raise exception 'MAINTENANCE_RECEIPT_NOT_SAVED';end if;
 delete from public.content_pipeline_staging_cleanup_lease where run_id=p_run_id and path in
 (select jsonb_array_elements_text(coalesce(p_summary->'deleted','[]'::jsonb)));
 delete from public.content_pipeline_staging_cleanup_lease where expires_at<=now();
 return jsonb_build_object('runId',r.run_id,'status',r.status);
end $$;
revoke all on function public.content_pipeline_finish_staging_maintenance_v1(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_finish_staging_maintenance_v1(uuid,jsonb,text) to service_role;
