-- Writer replan archives obsolete image tasks. Readiness counts only active tasks.
create or replace function public.content_pipeline_image_ready_guard_v1()
returns trigger language plpgsql security invoker set search_path='' as $function$
declare v_required int; v_done int;
begin
  if new.stage='IMAGE_READY' and old.stage is distinct from 'IMAGE_READY' then
    select count(*) filter (where status <> 'CANCELLED'),
           count(*) filter (where status = 'DONE')
      into v_required,v_done
      from public."21_content_pipeline_image"
      where pipeline_id=new.pipeline_id;
    if v_required=0 or v_done<>v_required then
      raise exception using errcode='40001',message='CONTENT_PIPELINE_IMAGES_NOT_COMPLETE';
    end if;
  end if;
  return new;
end $function$;

revoke all on function public.content_pipeline_image_ready_guard_v1() from public,anon,authenticated;
