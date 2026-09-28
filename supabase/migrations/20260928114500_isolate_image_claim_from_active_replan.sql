-- Writer explicitly syncs briefs after DRAFTED. A VISUAL pipeline already has
-- image tasks; syncing every VISUAL pipeline during a claim fails if an
-- unrelated producer is processing one of its images.
do $patch$
declare v_sql text; v_old text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_sql from pg_proc p
  where p.pronamespace='public'::regnamespace
    and p.proname='content_pipeline_claim_image_v1';
  v_old := 'where ownership_state=''CLAIMED'' and stage in (''DRAFTED'',''VISUAL'') order by updated_at,pipeline_id loop';
  v_new := 'where ownership_state=''CLAIMED'' and stage=''DRAFTED'' order by updated_at,pipeline_id loop';
  if v_sql is null or (length(v_sql)-length(replace(v_sql,v_old,'')))/length(v_old)<>1 then
    raise exception 'CLAIM_IMAGE_FUNCTION_UNEXPECTED_DEFINITION';
  end if;
  execute replace(v_sql,v_old,v_new);
end $patch$;
