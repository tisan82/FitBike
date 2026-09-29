-- Stable scheduled Planning entrypoint.
-- Keeps the existing atomic claim implementation and its service-role-only contract.
create or replace function public.content_pipeline_planning_next_v2()
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select public.content_pipeline_claim_planning_v1();
$$;

revoke all on function public.content_pipeline_planning_next_v2() from public, anon, authenticated;
grant execute on function public.content_pipeline_planning_next_v2() to service_role;

comment on function public.content_pipeline_planning_next_v2() is
'Service-role-only scheduled Planning entrypoint. Delegates atomically to content_pipeline_claim_planning_v1; added so scheduled workers use a stable orchestration entrypoint while preserving v1 claim semantics.';
