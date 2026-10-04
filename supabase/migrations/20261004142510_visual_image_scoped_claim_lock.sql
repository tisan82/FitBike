CREATE OR REPLACE FUNCTION public.content_pipeline_claim_visual_request_v1(p_worker_key text, p_request_id uuid, p_pipeline_image_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public."29_content_pipeline_visual_claim_request"%rowtype;
  i public."21_content_pipeline_image"%rowtype;
  response jsonb;
  run_id bigint;
begin
  if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 or p_request_id is null then
    raise exception 'INVALID_VISUAL_REQUEST';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visual-request:'||p_worker_key,0));

  select * into r
  from public."29_content_pipeline_visual_claim_request"
  where worker_key=p_worker_key and request_id=p_request_id;

  if found then
    if r.target_image_id is distinct from p_pipeline_image_id then
      raise exception 'VISUAL_REQUEST_INPUT_CONFLICT';
    end if;
    return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)
      || jsonb_build_object('replayed',true);
  end if;

  -- Lease exclusion is image-scoped; other images sharing a Worker remain eligible.
  if p_pipeline_image_id is not null and exists(
    select 1 from public."21_content_pipeline_image"
    where pipeline_image_id=p_pipeline_image_id and status='PROCESSING'
      and claim_expires_at>=now()) then
    return jsonb_build_object('requestId',p_request_id,'result','BUSY',
      'activeClaim',false,'claim',null,'reason','TARGET_IMAGE_OWNS_ACTIVE_CLAIM',
      'nextAction','CLAIM_NEXT_ELIGIBLE_IMAGE');
  end if;
  response:=public.content_pipeline_claim_visual_producer_v1(p_worker_key,p_pipeline_image_id);

  insert into public."29_content_pipeline_visual_claim_request"
    (worker_key,request_id,target_image_id,pipeline_image_id,response)
  values(
    p_worker_key,
    p_request_id,
    p_pipeline_image_id,
    (response->>'pipelineImageId')::bigint,
    response
  );

  return public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id)
    || jsonb_build_object('replayed',false);
end
$function$;

revoke all on function public.content_pipeline_claim_visual_request_v1(text,uuid,bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_claim_visual_request_v1(text,uuid,bigint) to service_role;
