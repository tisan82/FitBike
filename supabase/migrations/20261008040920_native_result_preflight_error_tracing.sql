begin;
do $guard$ begin
 if md5(pg_get_functiondef('public.content_pipeline_record_native_attempt_v1(text,uuid,uuid,text,jsonb)'::regprocedure)) <> '6107fee51e4a4a31d786904130edf09d' then raise exception 'NATIVE_AUDIT_PRODUCTION_DRIFT';end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.content_pipeline_native_attempt_core_v1(p_worker_key text, p_request_id uuid, p_attempt_id uuid, p_phase text, p_evidence jsonb, p_validate_only boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  return jsonb_build_object('valid',true,'recorded',not p_validate_only,'replayed',true,'attemptId',p_attempt_id,'attemptNumber',n,'phase',p_phase,'provenance','OPERATOR_REPORTED','serverObservedNativeCall',false);
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
  if p_evidence->>'contractHash' is distinct from h
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
   (p_evidence->'actualNativeCall' is distinct from req->'nativeCall' or p_evidence->'pixelsInspected' is distinct from 'true'::jsonb
    or jsonb_array_length(p_evidence->'outputs')=0 or not exists(select 1 from jsonb_array_elements(p_evidence->'outputs') checked_output where checked_output=p_evidence->'inspectedOutput')
    or jsonb_typeof(p_evidence->'pixelEvidence') is distinct from 'string' or length(coalesce(p_evidence->>'pixelEvidence',''))<20) then raise exception 'NATIVE_PIXEL_PASS_EVIDENCE_REQUIRED'; end if;
  if p_phase='TRANSPORT_ERROR' and (length(coalesce(p_evidence->>'error','')) not between 1 and 2000 or nullif(p_evidence->>'operationId','') is null) then raise exception 'NATIVE_TRANSPORT_ERROR_REQUIRED'; end if;
 end if;
 -- Never persist connector download capabilities or credentials in operator evidence.
 if p_evidence::text ~* '"(download_?url|authorization|access_?token|refresh_?token|signed_?url)"\s*:' then raise exception 'NATIVE_AUDIT_SECRET_FIELD_FORBIDDEN'; end if;
 if p_validate_only then
  return jsonb_build_object('valid',true,'recorded',false,'replayed',false,'attemptId',p_attempt_id,'phase',p_phase,'pipelineImageId',r.pipeline_image_id,'contractHash',h,'provenance','OPERATOR_REPORTED','serverObservedNativeCall',false);
 end if;
 insert into public."30_content_pipeline_native_attempt_event" values(p_worker_key,p_request_id,p_attempt_id,n,p_phase,r.pipeline_image_id,h,p_evidence,clock_timestamp());
 return jsonb_build_object('recorded',true,'replayed',false,'attemptId',p_attempt_id,'attemptNumber',n,'phase',p_phase,'pipelineImageId',r.pipeline_image_id,'contractHash',h,'provenance','OPERATOR_REPORTED','serverObservedNativeCall',false);
end $function$
;
create or replace function public.content_pipeline_record_native_attempt_v1(p_worker_key text,p_request_id uuid,p_attempt_id uuid,p_phase text,p_evidence jsonb)
returns jsonb language sql security definer set search_path='' as $$
 select public.content_pipeline_native_attempt_core_v1(p_worker_key,p_request_id,p_attempt_id,p_phase,p_evidence,false);
$$;
create or replace function public.content_pipeline_validate_native_result_v1(p_worker_key text,p_request_id uuid,p_attempt_id uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb; message text; code text; field text; reason text;
begin
 v:=public.content_pipeline_native_attempt_core_v1(p_worker_key,p_request_id,p_attempt_id,'RESULT',p_evidence,true);
 return v||jsonb_build_object('validationScope','RESULT_RECORDING_ONLY','runtimeSchemaValidated',false,'claimCreated',false);
exception when others then
 get stacked diagnostics message = MESSAGE_TEXT;
 code:=split_part(message,':',1);
 if code !~ '^[A-Z][A-Z0-9_]{1,100}$' then code:='NATIVE_RESULT_VALIDATION_FAILED';end if;
 field:=case
 when code='INVALID_NATIVE_OUTPUT_IDENTITY' then 'evidence.outputs'
 when code='INVALID_NATIVE_OPERATION_ID' then 'evidence.operationId'
 when code='NATIVE_RESULT_EVIDENCE_REQUIRED' then 'evidence.actualNativeCall/outputs/pixelQa'
 when code='NATIVE_PIXEL_PASS_EVIDENCE_REQUIRED' then 'evidence.actualNativeCall/inspectedOutput/pixelsInspected/pixelEvidence'
 when code='NATIVE_REQUEST_EVENT_REQUIRED' then 'attemptId'
 when code='NATIVE_ATTEMPT_RECEIPT_REQUIRED' then 'requestId'
 when code='NATIVE_ATTEMPT_EVENT_IMMUTABLE' then 'evidence'
 when code in ('INVALID_NATIVE_EVIDENCE_FIELD','INVALID_NATIVE_CALL_ARGUMENTS','NATIVE_AUDIT_SECRET_FIELD_FORBIDDEN') then trim(split_part(message,':',2))
 else 'evidence' end;
 if field is null or field !~ '^[A-Za-z0-9_./\[\]-]{1,200}$' then field:='evidence';end if;
 reason:=case code
 when 'INVALID_NATIVE_OUTPUT_IDENTITY' then 'Each output needs an actual fileId or absolute path; only fileId,path,mimeType,sha256 are allowed.'
 when 'INVALID_NATIVE_OPERATION_ID' then 'operationId must be a UUID.'
 when 'NATIVE_RESULT_EVIDENCE_REQUIRED' then 'actualNativeCall object, outputs array and PASS/FAIL/NOT_INSPECTED pixelQa are required.'
 when 'NATIVE_PIXEL_PASS_EVIDENCE_REQUIRED' then 'PASS requires exact REQUEST call equality, true pixelsInspected, nonempty outputs, an exact inspectedOutput member and at least 20 characters of actual pixel evidence.'
 when 'NATIVE_REQUEST_EVENT_REQUIRED' then 'Save the matching REQUEST before RESULT.'
 when 'NATIVE_ATTEMPT_RECEIPT_REQUIRED' then 'Use the authenticated Producer receipt.'
 when 'NATIVE_ATTEMPT_EVENT_IMMUTABLE' then 'Identical replay is allowed; changed recorded evidence is rejected.'
 when 'NATIVE_AUDIT_SECRET_FIELD_FORBIDDEN' then 'Do not record credentials, signed capabilities or image bytes.'
 when 'INVALID_NATIVE_EVIDENCE_FIELD' then 'Unknown RESULT evidence field.'
 when 'INVALID_NATIVE_CALL_ARGUMENTS' then 'The actualNativeCall audit envelope is invalid; validate the exact actual capture with validate_visual_generation_call.'
 else 'RESULT validation failed; inspect the matching receipt and actual evidence.' end;
 return jsonb_build_object('valid',false,'code',code,'field',field,'reason',reason,'recorded',false,'claimCreated',false,'validationScope','RESULT_RECORDING_ONLY','runtimeSchemaValidated',false,'serverObservedNativeCall',false);
end $$;
revoke all on function public.content_pipeline_native_attempt_core_v1(text,uuid,uuid,text,jsonb,boolean) from public,anon,authenticated;
revoke all on function public.content_pipeline_validate_native_result_v1(text,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.content_pipeline_record_native_attempt_v1(text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_native_attempt_core_v1(text,uuid,uuid,text,jsonb,boolean) to service_role;
grant execute on function public.content_pipeline_validate_native_result_v1(text,uuid,uuid,jsonb) to service_role;
grant execute on function public.content_pipeline_record_native_attempt_v1(text,uuid,uuid,text,jsonb) to service_role;

commit;
