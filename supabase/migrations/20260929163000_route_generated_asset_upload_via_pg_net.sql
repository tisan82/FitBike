-- Route generated image uploads through Postgres pg_net so scheduled workers do not
-- depend on outbound DNS/network access to Supabase Edge Functions.

alter table public."21_content_pipeline_image"
  add column if not exists upload_request_id bigint,
  add column if not exists upload_dispatched_at timestamptz;

create or replace function public.content_pipeline_dispatch_generated_asset_upload_v1(
  p_pipeline_image_id bigint, p_claim_token uuid, p_handoff_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype;
h public."25_content_pipeline_generated_asset_handoff"%rowtype; v_chunks int; v_ticket jsonb; v_request_id bigint;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token then raise exception 'CONTENT_PIPELINE_IMAGE_CLAIM_CONFLICT'; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 select * into h from public."25_content_pipeline_generated_asset_handoff" where handoff_id=p_handoff_id;
 if not found or h.pipeline_image_id<>i.pipeline_image_id or h.pipeline_id<>i.pipeline_id or h.content_key<>p.content_key
   or h.asset_key<>i.asset_key or h.consumed_at is not null or h.expires_at<=now() then raise exception 'CONTENT_PIPELINE_GENERATED_HANDOFF_INVALID'; end if;
 select count(*) into v_chunks from public."26_content_pipeline_generated_asset_chunk" where handoff_id=p_handoff_id;
 if v_chunks<>h.chunk_count then raise exception 'CONTENT_PIPELINE_GENERATED_HANDOFF_INCOMPLETE'; end if;
 v_ticket:=public.content_pipeline_issue_asset_upload_ticket_v1(i.pipeline_id,i.asset_key);
 select net.http_post(url:='https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-asset-upload',
   headers:=jsonb_build_object('content-type','application/json','x-fitbike-upload-ticket',v_ticket->>'ticket'),
   body:=jsonb_build_object('pipelineId',i.pipeline_id,'contentKey',p.content_key,'assetKey',i.asset_key,'handoffId',p_handoff_id,'replaceExisting',false),
   timeout_milliseconds:=15000) into v_request_id;
 update public."21_content_pipeline_image" set upload_request_id=v_request_id,upload_dispatched_at=now(),upload_status='DISPATCHED',updated_at=now()
 where pipeline_image_id=i.pipeline_image_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'requestId',v_request_id,'status','DISPATCHED');
end $$;

create or replace function public.content_pipeline_finalize_dispatched_upload_v1(
 p_pipeline_image_id bigint,p_pipeline_image_run_id bigint,p_claim_token uuid
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare i public."21_content_pipeline_image"%rowtype; r record; b jsonb; v_upload text;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token then raise exception 'CONTENT_PIPELINE_IMAGE_CLAIM_CONFLICT'; end if;
 if i.upload_request_id is null then raise exception 'CONTENT_PIPELINE_UPLOAD_NOT_DISPATCHED'; end if;
 select * into r from net._http_response where id=i.upload_request_id;
 if not found then return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'status','PENDING','requestId',i.upload_request_id); end if;
 if coalesce(r.timed_out,false) or r.error_msg is not null or r.status_code not in (200,201) then
   raise exception 'CONTENT_PIPELINE_UPLOAD_HTTP_FAILED: % % %',r.status_code,r.error_msg,left(coalesce(r.content,''),500); end if;
 b:=r.content::jsonb; v_upload:=case when b->>'status'='REUSED' then 'REUSED' else 'UPLOADED' end;
 return public.content_pipeline_complete_image_v1(i.pipeline_image_id,p_pipeline_image_run_id,p_claim_token,
   'PASS','PASS','PASS',v_upload,b->>'bucket',b->>'storagePath',b->>'sha256',
   jsonb_build_object('uploadTransport','PG_NET_HANDOFF','requestId',i.upload_request_id,'edgeStatus',b->>'status','bytes',b->'bytes'));
end $$;

revoke all on function public.content_pipeline_dispatch_generated_asset_upload_v1(bigint,uuid,uuid) from public,anon,authenticated;
revoke all on function public.content_pipeline_finalize_dispatched_upload_v1(bigint,bigint,uuid) from public,anon,authenticated;
