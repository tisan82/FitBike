revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;

alter function public.set_updated_at() set search_path = pg_catalog;
