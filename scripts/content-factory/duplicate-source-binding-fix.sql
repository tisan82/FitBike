begin;
set local lock_timeout='5s';
do $binding_fix$
declare definition text;
begin
 perform pg_advisory_xact_lock(hashtextextended('fitbike-visual-delivery-release',0));
 definition:=pg_get_functiondef('public.content_pipeline_return_duplicate_visual_candidate_v1(text,uuid,uuid,text)'::regprocedure);
 if position('candidate jsonb;image_id bigint;' in definition)>0 then
  execute regexp_replace(definition,'\mimage_id\M','v_image_id','g');
 elsif position('candidate jsonb;v_image_id bigint;' in definition)=0 then
  raise exception 'DUPLICATE_BINDING_DEFINITION_CHANGED';
 end if;
end $binding_fix$;
commit;
