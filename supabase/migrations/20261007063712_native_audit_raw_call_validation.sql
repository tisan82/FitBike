begin;
create or replace function public.content_pipeline_validate_native_call_v2(p_call jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare a jsonb; k text; prefix text:='nativeCall'; raw boolean:=false;
begin
 if jsonb_typeof(p_call) is distinct from 'object' then
  return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix,'reason','object required'); end if;
 if length(p_call::text)>10000 then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix,'reason','maximum 10000 JSON characters'); end if;
 if p_call::text ~* '"(download_?url|authorization|access_?token|refresh_?token|signed_?url|api_?key|password|secret)"\s*:' or p_call::text ~* '(https?[^" ]*[?&](token|signature|sig|x-amz-signature)=|data:image/[^;]+;base64,)' then
  return jsonb_build_object('valid',false,'code','NATIVE_AUDIT_SECRET_FIELD_FORBIDDEN','field',prefix,'reason','credentials, signed capabilities and inline image bytes must not be logged'); end if;
 raw:=p_call ? 'toolName' or p_call ? 'schemaVersion' or p_call ? 'arguments';
 if raw then
  select key into k from jsonb_object_keys(p_call) key where key not in ('toolName','schemaVersion','arguments') limit 1;
  if k is not null then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix||'.'||k,'reason','unknown envelope field'); end if;
  if p_call->>'schemaVersion' is distinct from 'RAW_ARGUMENTS_V1' then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix||'.schemaVersion','reason','RAW_ARGUMENTS_V1 required'); end if;
  if jsonb_typeof(p_call->'toolName') is distinct from 'string' or p_call->>'toolName' not in ('image_gen.text2im','image_gen.imagegen','imagegen.text2im','imagegen.imagegen') then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix||'.toolName','reason','use the actual native image tool name'); end if;
  a:=p_call->'arguments'; prefix:=prefix||'.arguments';
 else a:=p_call; end if;
 if jsonb_typeof(a) is distinct from 'object' then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix,'reason','object required'); end if;
 if jsonb_typeof(a->'prompt') is distinct from 'string' or length(coalesce(a->>'prompt','')) not between 20 and 6000 then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix||'.prompt','reason','string of 20 to 6000 characters required'); end if;
 if not raw then
  select key into k from jsonb_object_keys(a) key where key not in ('prompt','transparent_background','referenced_image_paths','num_last_images_to_include') limit 1;
  if k is not null then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix||'.'||k,'reason','legacy format supports four keys; preserve actual arguments using RAW_ARGUMENTS_V1 envelope'); end if;
  if a ? 'transparent_background' and jsonb_typeof(a->'transparent_background') is distinct from 'boolean' then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix||'.transparent_background','reason','boolean required'); end if;
  if a ? 'num_last_images_to_include' and (jsonb_typeof(a->'num_last_images_to_include') is distinct from 'number' or a->>'num_last_images_to_include' !~ '^[1-5]$') then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix||'.num_last_images_to_include','reason','integer 1 to 5; omit for fresh generation'); end if;
  if a ? 'referenced_image_paths' then
   if jsonb_typeof(a->'referenced_image_paths') is distinct from 'array' then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix||'.referenced_image_paths','reason','array required'); end if;
   if jsonb_array_length(a->'referenced_image_paths') not between 1 and 5 or exists(select 1 from jsonb_array_elements(a->'referenced_image_paths') v where jsonb_typeof(v) is distinct from 'string' or length(v#>>'{}')>1000 or v#>>'{}' !~ '^/') then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix||'.referenced_image_paths','reason','1 to 5 actual absolute paths required'); end if;
  end if;
  if a ? 'referenced_image_paths' and a ? 'num_last_images_to_include' then return jsonb_build_object('valid',false,'code','INVALID_NATIVE_CALL_ARGUMENTS','field',prefix,'reason','reference paths and prior-image count are mutually exclusive'); end if;
 end if;
 return jsonb_build_object('valid',true,'validationScope','AUDIT_CAPTURE_ONLY','format',case when raw then 'RAW_ARGUMENTS_V1' else 'LEGACY_IMAGEGEN_V1' end,'runtimeSchemaValidated',false,'claimCreated',false,'serverObservedNativeCall',false);
end $$;
revoke all on function public.content_pipeline_validate_native_call_v2(jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_validate_native_call_v2(jsonb) to service_role;
create or replace function public.content_pipeline_record_native_attempt_v1(p_worker_key text,p_request_id uuid,p_attempt_id uuid,p_phase text,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; r public."29_content_pipeline_visual_claim_request"%rowtype; prior jsonb; req jsonb; h text; nc jsonb; n integer; current_hash text; o jsonb; validation jsonb; bad_field text;
begin
 if p_attempt_id is null or p_phase not in ('REQUEST','RESULT','TRANSPORT_ERROR') or p_phase is null
 or jsonb_typeof(p_evidence) is distinct from 'object' or length(p_evidence::text)>12000 then raise exception 'INVALID_NATIVE_ATTEMPT_EVENT'; end if;
 select k into bad_field from jsonb_object_keys(p_evidence) k where not(k=any(case p_phase
 when 'REQUEST' then array['contractHash','nativeCall','productionMethod','references']
 when 'RESULT' then array['actualNativeCall','outputs','inspectedOutput','pixelsInspected','pixelQa','pixelEvidence','operationId','toolCallId','toolError']
 else array['operationId','error','code'] end)) limit 1;
 if bad_field is not null then raise exception 'INVALID_NATIVE_EVIDENCE_FIELD: evidence.%: unknown field for %',bad_field,p_phase;end if;
 select * into r from public."29_content_pipeline_visual_claim_request" where worker_key=p_worker_key and request_id=p_request_id for update;
 if not found or r.pipeline_image_id is null or r.response->>'executionRole'='REVIEWER' then raise exception 'NATIVE_ATTEMPT_RECEIPT_REQUIRED'; end if;
 h:=r.response->>'generationContractHash';
 if h is null then raise exception 'NATIVE_ATTEMPT_CONTRACT_REQUIRED'; end if;
 if p_evidence ? 'operationId' and coalesce(p_evidence->>'operationId','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'INVALID_NATIVE_OPERATION_ID'; end if;
 select evidence,attempt_number into prior,n from public."30_content_pipeline_native_attempt_event" where worker_key=p_worker_key and request_id=p_request_id and attempt_id=p_attempt_id and phase=p_phase;
 if found then
  if prior<>p_evidence then raise exception 'NATIVE_ATTEMPT_EVENT_IMMUTABLE'; end if;
  return jsonb_build_object('recorded',true,'replayed',true,'attemptId',p_attempt_id,'attemptNumber',n,'phase',p_phase,'provenance','OPERATOR_REPORTED','serverObservedNativeCall',false);
 end if;
 if p_phase in ('REQUEST','RESULT') then
  nc:=case when p_phase='REQUEST' then p_evidence->'nativeCall' else p_evidence->'actualNativeCall' end;
  validation:=public.content_pipeline_validate_native_call_v2(nc);
  if validation->>'valid' is distinct from 'true' then raise exception '%: %: %',validation->>'code',replace(validation->>'field','nativeCall',case when p_phase='RESULT' then 'actualNativeCall' else 'nativeCall' end),validation->>'reason';end if;
 end if;
 if p_phase='REQUEST' then
  select generation_contract_hash into current_hash from public."21_content_pipeline_image" where pipeline_image_id=r.pipeline_image_id for update;
  if current_hash is distinct from h then raise exception 'NATIVE_ATTEMPT_CURRENT_CONTRACT_MISMATCH';end if;
  c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
  if c->>'activeClaim' is distinct from 'true' then raise exception 'ACTIVE_VISUAL_CLAIM_REQUIRED'; end if;
  if p_evidence->>'contractHash' is distinct from h or length(coalesce(p_evidence->'nativeCall'->>'prompt',p_evidence->'nativeCall'->'arguments'->>'prompt','')) not between 20 and 6000
   or jsonb_typeof(p_evidence->'nativeCall') is distinct from 'object' then raise exception 'NATIVE_REQUEST_ARGUMENTS_REQUIRED'; end if;
  select count(*)+1 into n from public."30_content_pipeline_native_attempt_event" where worker_key=p_worker_key and request_id=p_request_id and phase='REQUEST';
  if n>3 then raise exception 'NATIVE_ATTEMPT_LIMIT'; end if;
 else
  select evidence,attempt_number into req,n from public."30_content_pipeline_native_attempt_event" where worker_key=p_worker_key and request_id=p_request_id and attempt_id=p_attempt_id and phase='REQUEST';
  if not found then raise exception 'NATIVE_REQUEST_EVENT_REQUIRED'; end if;
  -- Late result/error recording is allowed for this immutable receipt only; never renews a lease.
  if p_phase='RESULT' and (jsonb_typeof(p_evidence->'actualNativeCall') is distinct from 'object'
    or jsonb_typeof(p_evidence->'outputs') is distinct from 'array'
    or p_evidence->>'pixelQa' not in ('PASS','FAIL','NOT_INSPECTED') or p_evidence->>'pixelQa' is null) then raise exception 'NATIVE_RESULT_EVIDENCE_REQUIRED'; end if;
  if p_phase='RESULT' then
   if jsonb_array_length(p_evidence->'outputs')>5 then raise exception 'INVALID_NATIVE_OUTPUT_IDENTITY';end if;
   for o in select value from jsonb_array_elements(p_evidence->'outputs') loop
    if jsonb_typeof(o)<>'object' then raise exception 'INVALID_NATIVE_OUTPUT_IDENTITY';end if;
    if exists(select 1 from jsonb_object_keys(o) k where k not in ('fileId','path','mimeType','sha256'))
     or not coalesce(((jsonb_typeof(o->'fileId')='string' and length(o->>'fileId') between 1 and 200) or (jsonb_typeof(o->'path')='string' and length(o->>'path') between 2 and 1000 and o->>'path' ~ '^/')),false) then raise exception 'INVALID_NATIVE_OUTPUT_IDENTITY';end if;
    if o ? 'path' and (jsonb_typeof(o->'path') is distinct from 'string' or length(coalesce(o->>'path','')) not between 2 and 1000 or coalesce(o->>'path','') !~ '^/') then raise exception 'INVALID_NATIVE_OUTPUT_IDENTITY';end if;
    if o ? 'fileId' and (jsonb_typeof(o->'fileId') is distinct from 'string' or length(coalesce(o->>'fileId','')) not between 1 and 200) then raise exception 'INVALID_NATIVE_OUTPUT_IDENTITY';end if;
    if o ? 'sha256' and coalesce(o->>'sha256','') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_NATIVE_OUTPUT_IDENTITY';end if;
   end loop;
  end if;
  if p_phase='RESULT' and p_evidence->>'pixelQa'='PASS' and
   (p_evidence->'actualNativeCall' is distinct from req->'nativeCall' or p_evidence->>'pixelsInspected' is distinct from 'true'
    or jsonb_array_length(p_evidence->'outputs')=0 or not exists(select 1 from jsonb_array_elements(p_evidence->'outputs') checked_output where checked_output=p_evidence->'inspectedOutput')
    or length(coalesce(p_evidence->>'pixelEvidence',''))<20) then raise exception 'NATIVE_PIXEL_PASS_EVIDENCE_REQUIRED'; end if;
  if p_phase='TRANSPORT_ERROR' and (length(coalesce(p_evidence->>'error','')) not between 1 and 2000 or nullif(p_evidence->>'operationId','') is null) then raise exception 'NATIVE_TRANSPORT_ERROR_REQUIRED'; end if;
 end if;
 -- Never persist connector download capabilities or credentials in operator evidence.
 if p_evidence::text ~* '"(download_?url|authorization|access_?token|refresh_?token|signed_?url)"\s*:' then raise exception 'NATIVE_AUDIT_SECRET_FIELD_FORBIDDEN'; end if;
 insert into public."30_content_pipeline_native_attempt_event" values(p_worker_key,p_request_id,p_attempt_id,n,p_phase,r.pipeline_image_id,h,p_evidence,clock_timestamp());
 return jsonb_build_object('recorded',true,'replayed',false,'attemptId',p_attempt_id,'attemptNumber',n,'phase',p_phase,'pipelineImageId',r.pipeline_image_id,'contractHash',h,'provenance','OPERATOR_REPORTED','serverObservedNativeCall',false);
end $$;
commit;
