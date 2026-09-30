-- Separate visual production from publication without changing the content pipeline stage enum.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('content-pipeline-staging','content-pipeline-staging',false,4194304,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=4194304,allowed_mime_types=array['image/webp'];
alter table public."21_content_pipeline_image" add column if not exists staging_asset jsonb;
alter table public."21_content_pipeline_image" add column if not exists staging_input jsonb;
alter table public."21_content_pipeline_image" add column if not exists handoff_phase text;
alter table public."21_content_pipeline_image" drop constraint "21_content_pipeline_image_status_check";
alter table public."21_content_pipeline_image" add constraint "21_content_pipeline_image_status_check"
check(status in ('PENDING','PROCESSING','READY_FOR_UPLOAD','RETRY','HOLD','BLOCKED','DONE','CANCELLED'));
alter table public."21_content_pipeline_image" add constraint image_handoff_phase_check
check(handoff_phase is null or handoff_phase in ('PRODUCING','STAGING','READY_FOR_UPLOAD','UPLOADING','VERIFYING','DONE','RETURN_TO_IMAGE_PRODUCTION'));
create index if not exists idx_image_staging_queue on public."21_content_pipeline_image"(status,next_eligible_at,pipeline_id,ordinal) where staging_asset is not null;
CREATE OR REPLACE FUNCTION public.content_pipeline_claim_image_v1(p_worker_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  i public."21_content_pipeline_image"%rowtype;
  p public."18_content_pipeline"%rowtype;
  v_target_pipeline_id bigint;
  v_token uuid:=extensions.gen_random_uuid();
  v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_WORKER_KEY'; end if;
 for p in select p0.* from public."18_content_pipeline" p0 join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id where p0.ownership_state='CLAIMED' and p0.stage='DRAFTED' order by t0.priority,t0.content_topic_id,p0.pipeline_id loop
   begin
     perform public.content_pipeline_sync_images_v1(p.pipeline_id);
   exception when others then
     continue;
   end;
 end loop;
 select p0.pipeline_id into v_target_pipeline_id from public."18_content_pipeline" p0 join public."16_content_topic" t0 on t0.content_topic_id=p0.content_topic_id where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL') and exists(select 1 from public."21_content_pipeline_image" ix where ix.pipeline_id=p0.pipeline_id and ix.status not in ('DONE','CANCELLED')) order by t0.priority,t0.content_topic_id,p0.pipeline_id limit 1;
 if v_target_pipeline_id is null then return null; end if;
 select i0.* into i from public."21_content_pipeline_image" i0 where i0.pipeline_id=v_target_pipeline_id and i0.status not in ('DONE','CANCELLED','READY_FOR_UPLOAD') and i0.staging_asset is null order by i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 if i.status='PROCESSING' and i.claim_expires_at>=now() then return null; end if;
 if i.status='RETRY' and coalesce(i.next_eligible_at,'-infinity'::timestamptz)>now() then return null; end if;
 if i.status not in ('PENDING','RETRY','PROCESSING') then return null; end if;
 v_old_token:=i.claim_token;
 if i.status='PROCESSING' and i.claim_expires_at<now() and v_old_token is not null then
   update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_EXPIRED',error='Image claim TTL expired before Complete/Fail RPC.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reclaimedAt',now()) where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status='RUNNING';
 end if;
 v_contract:=public.content_pipeline_build_image_generation_contract_v1(i.pipeline_image_id);
 v_hash:=encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex');
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage='DRAFTED';
 update public."21_content_pipeline_image" set status='PROCESSING',handoff_phase='PRODUCING',claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval '60 minutes',attempt_count=attempt_count+1,generation_contract=v_contract,generation_contract_hash=v_hash,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now() where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata) values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract,'claimOrder','TOPIC_PRIORITY_THEN_IMAGE_ORDINAL','claimTtlMinutes',60)) returning pipeline_image_run_id into v_run;
 if i.staging_input is not null and i.staging_input->>'contractHash'=v_hash then
   update public."25_content_pipeline_generated_asset_handoff" set claim_token=v_token,expires_at=now()+interval '60 minutes'
   where handoff_id=(i.staging_input->>'handoffId')::uuid and pipeline_image_id=i.pipeline_image_id and consumed_at is null;
 end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash,'claimExpiresAt',i.claim_expires_at,'preservedStagingInput',case when i.staging_input->>'contractHash'=v_hash then i.staging_input else null end);
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_build_image_generation_contract_v1(p_pipeline_image_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype;
 b jsonb; inner_b jsonb; c jsonb;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_IMAGE_NOT_FOUND'; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_NOT_FOUND'; end if;
 b:=coalesce(i.image_brief,'{}'::jsonb);
 inner_b:=case when jsonb_typeof(b->'image_brief')='object' then b->'image_brief' else b end;
 c:=jsonb_strip_nulls(jsonb_build_object(
 'contract_version',3,'pipeline_image_id',i.pipeline_image_id,'pipeline_id',i.pipeline_id,
 'content_key',p.content_key,'topic_key',p.topic_key,'image_id',i.image_id,'asset_key',i.asset_key,
 'asset_role',coalesce(inner_b->>'asset_role',b->>'asset_role',inner_b->>'role',b->>'role','BODY'),
 'role',coalesce(inner_b->>'visual_role',inner_b->>'role',b->>'role'),
 'subject',inner_b->>'subject','scene',inner_b->'scene',
 'visual_objective',coalesce(inner_b->>'visual_objective',b->>'visual_objective'),
 'user_question_supported',coalesce(inner_b->>'user_question_supported',inner_b->>'user_question',b->>'user_question'),
 'source_strategy',coalesce(inner_b->>'source_strategy',b->>'source_strategy'),
 'generation_allowed',coalesce((inner_b->>'generation_allowed')::boolean,(b->>'generation_allowed')::boolean,false),
 'real_source_required',coalesce((inner_b->>'real_source_required')::boolean,(b->>'real_source_required')::boolean,not coalesce((inner_b->>'generation_allowed')::boolean,(b->>'generation_allowed')::boolean,false)),
 'ai_edit_allowed',coalesce((inner_b->>'ai_edit_allowed')::boolean,(b->>'ai_edit_allowed')::boolean,true),
 'full_generation_allowed',coalesce(inner_b->'full_generation_allowed',b->'full_generation_allowed',to_jsonb(case when coalesce((inner_b->>'generation_allowed')::boolean,(b->>'generation_allowed')::boolean,false) then 'fallback_only' else 'never' end)),
 'source_priority',coalesce(inner_b->'source_priority',b->'source_priority','["REAL_SOURCE_AI_EDIT","REAL_SOURCE_DIRECT","OFFICIAL_PDF","FULL_AI_GENERATION"]'::jsonb),
 'people_mode',coalesce(inner_b->>'people_mode',b->>'people_mode','NONE'),
 'guidance_mode',coalesce(inner_b->>'guidance_mode',b->>'guidance_mode'),
 'inspection_target',inner_b->>'inspection_target','inspection_point',inner_b->>'inspection_point',
 'label_text',inner_b->>'label_text','marker_allowed',inner_b->'marker_allowed',
 'must_show',coalesce(inner_b->'must_show','[]'::jsonb),
 'must_not_show',coalesce(inner_b->'must_not_show',inner_b->'prohibited','[]'::jsonb),
 'fact_dependencies',coalesce(inner_b->'fact_dependencies','[]'::jsonb),
 'safety_dependencies',coalesce(inner_b->'safety_dependencies','[]'::jsonb),
 'text_in_image',inner_b->'text_in_image','mobile_requirement',coalesce(inner_b->>'mobile_requirement',b->>'mobile_requirement'),
 'preferred_orientation',inner_b->>'preferred_orientation',
 'alt_text_draft',coalesce(inner_b->>'alt_text_draft',inner_b->>'alt_draft',b->>'alt_text_draft',b->>'alt_draft'),
 'content_isolation_rule','Use only this generation contract for this image. Do not inherit subject, scene, objects, text, layout, prior generated image, or visual prompt from any other content or image task.'
 ));
 if coalesce(c->>'content_key','')='' or coalesce(c->>'image_id','')='' or coalesce(c->>'asset_key','')='' then
 raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_CONTRACT_INCOMPLETE'; end if;
 return c;
end $function$
;

create or replace function public.content_pipeline_claim_asset_publisher_v1(p_worker_key text,p_pipeline_image_id bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; v_run bigint; v_token uuid:=extensions.gen_random_uuid(); v_key text;
begin
 if p_worker_key is null or length(trim(p_worker_key)) not between 1 and 100 then raise exception 'INVALID_WORKER_KEY'; end if;
 select i0.* into i from public."21_content_pipeline_image" i0
 join public."18_content_pipeline" p on p.pipeline_id=i0.pipeline_id
 join public."16_content_topic" t on t.content_topic_id=p.content_topic_id
 where p.ownership_state='CLAIMED' and p.stage in ('DRAFTED','VISUAL') and i0.staging_asset is not null
 and (p_pipeline_image_id is null or i0.pipeline_image_id=p_pipeline_image_id)
 and (i0.status='READY_FOR_UPLOAD' or (i0.status='RETRY' and coalesce(i0.next_eligible_at,'-infinity'::timestamptz)<=now())
 or (i0.status='PROCESSING' and i0.claim_expires_at<now()))
 order by t.priority,t.content_topic_id,i0.ordinal,i0.pipeline_image_id for update of i0 skip locked limit 1;
 if not found then return null; end if;
 if i.staging_asset->>'contractHash' is distinct from i.generation_contract_hash then raise exception 'STAGING_CONTRACT_MISMATCH'; end if;
 update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_code='CLAIM_EXPIRED'
 where pipeline_image_id=i.pipeline_image_id and status='RUNNING';
 update public."21_content_pipeline_image" set status='PROCESSING',handoff_phase='UPLOADING',claimed_by=p_worker_key,
 claim_token=v_token,claimed_at=now(),claim_expires_at=now()+interval '60 minutes',attempt_count=attempt_count+1,
 upload_request_id=null,upload_dispatched_at=null,failure_code=null,failure_stage=null,last_error=null,updated_at=now()
 where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata)
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',jsonb_build_object('stage','3-B','stagingAsset',i.staging_asset)) returning pipeline_image_run_id into v_run;
 select content_key into v_key from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineId',i.pipeline_id,'pipelineImageRunId',v_run,
 'claimToken',v_token,'contentKey',v_key,'imageId',i.image_id,'assetKey',i.asset_key,'stagingAsset',i.staging_asset,'generationContract',i.generation_contract);
end $$;

-- Server-only completion after actual read-back. Metadata is not a substitute for binary checks.
create or replace function public.content_pipeline_record_staging_v1(p_pipeline_image_id bigint,p_claim_token uuid,p_asset jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; v_path text;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token or i.claim_expires_at<=now() then raise exception 'INVALID_IMAGE_CLAIM'; end if;
 v_path:=i.pipeline_id||'/'||i.pipeline_image_id||'/'||(p_asset->>'sha256')||'.webp';
 if p_asset->>'bucket' is distinct from 'content-pipeline-staging' or p_asset->>'path' is distinct from v_path
 or coalesce(p_asset->>'sha256','') !~ '^[a-f0-9]{64}$' or p_asset->>'mime' is distinct from 'image/webp'
 or coalesce((p_asset->>'bytes')::int,0) not between 12 and 4194304
 or coalesce((p_asset->>'width')::int,0)<1 or coalesce((p_asset->>'height')::int,0)<1
 or p_asset->>'decode' is distinct from 'PASS' or p_asset->>'storageVerification' is distinct from 'PASS'
 or p_asset->>'contractHash' is distinct from i.generation_contract_hash
 or p_asset->'qa'->>'imageQa' is distinct from 'PASS' or p_asset->'qa'->>'mobileQa' is distinct from 'PASS'
 or p_asset->'qa'->>'imageSeoQa' is distinct from 'PASS' then raise exception 'STAGING_PROOF_REQUIRED'; end if;
 if not exists(select 1 from storage.objects where bucket_id='content-pipeline-staging' and name=v_path
 and metadata->>'mimetype'='image/webp' and (metadata->>'size')::int=(p_asset->>'bytes')::int) then raise exception 'STAGING_OBJECT_MISSING'; end if;
 update public."23_content_pipeline_image_run" set status='PASS',summary='3-A READY_FOR_UPLOAD',completed_at=now(),
 metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('stage','3-A','stagingAsset',p_asset)
 where pipeline_image_id=i.pipeline_image_id and claim_token=p_claim_token and status='RUNNING';
 update public."21_content_pipeline_image" set staging_asset=p_asset,staging_input=null,status='READY_FOR_UPLOAD',handoff_phase='READY_FOR_UPLOAD',
 generation_status='PASS',qa_status='PASS',file_status='PASS',upload_status='PENDING',claimed_by=null,claim_token=null,
 claimed_at=null,claim_expires_at=null,next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now()
 where pipeline_image_id=i.pipeline_image_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'status','READY_FOR_UPLOAD','stagingAsset',p_asset);
end $$;

create or replace function public.content_pipeline_dispatch_staging_v1(p_pipeline_image_id bigint,p_claim_token uuid,p_handoff_id uuid,p_qa jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; h public."25_content_pipeline_generated_asset_handoff"%rowtype; t jsonb; v_key text; v_id bigint;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token or i.claim_expires_at<=now() or i.staging_asset is not null then raise exception 'INVALID_IMAGE_CLAIM'; end if;
 if upper(coalesce(i.generation_contract->>'asset_role','BODY')) in ('THUMBNAIL','HERO','THUMBNAIL_HERO') and p_qa->>'representativeImageQa' is distinct from 'PASS' then raise exception 'REPRESENTATIVE_QA_REQUIRED'; end if;
 if upper(coalesce(i.generation_contract->>'asset_role','BODY')) in ('THUMBNAIL','THUMBNAIL_HERO') and p_qa->>'cardCropQa' is distinct from 'PASS' then raise exception 'CARD_CROP_QA_REQUIRED'; end if;
 if upper(coalesce(i.generation_contract->>'asset_role','BODY')) in ('HERO','THUMBNAIL_HERO') and p_qa->>'heroCropQa' is distinct from 'PASS' then raise exception 'HERO_CROP_QA_REQUIRED'; end if;
 if p_qa->>'imageQa' is distinct from 'PASS' or p_qa->>'mobileQa' is distinct from 'PASS' or p_qa->>'imageSeoQa' is distinct from 'PASS'
 or p_qa->>'contractHash' is distinct from i.generation_contract_hash then raise exception 'VISUAL_QA_REQUIRED'; end if;
 select * into h from public."25_content_pipeline_generated_asset_handoff" where handoff_id=p_handoff_id;
 if not found or h.pipeline_image_id<>i.pipeline_image_id or h.claim_token is distinct from p_claim_token then raise exception 'INVALID_HANDOFF'; end if;
 perform public.content_pipeline_verify_generated_asset_handoff_v1(p_handoff_id);
 select content_key into v_key from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 t:=public.content_pipeline_issue_asset_upload_ticket_v1(i.pipeline_id,i.asset_key);
 select net.http_post(url:='https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-staging',
 headers:=jsonb_build_object('content-type','application/json','x-fitbike-upload-ticket',t->>'ticket'),
 body:=jsonb_build_object('mode','stage','pipelineImageId',i.pipeline_image_id,'claimToken',p_claim_token,'handoffId',p_handoff_id,'qa',p_qa),timeout_milliseconds:=60000) into v_id;
 update public."21_content_pipeline_image" set handoff_phase='STAGING',staging_input=jsonb_build_object('handoffId',p_handoff_id,'qa',p_qa,'contractHash',i.generation_contract_hash),upload_request_id=v_id,upload_dispatched_at=now() where pipeline_image_id=i.pipeline_image_id;
 return jsonb_build_object('status','DISPATCHED','requestId',v_id);
end $$;

create or replace function public.content_pipeline_dispatch_asset_publisher_v1(p_pipeline_image_id bigint,p_claim_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; t jsonb; v_id bigint;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token or i.claim_expires_at<=now() or i.staging_asset is null then raise exception 'INVALID_PUBLISHER_CLAIM'; end if;
 if i.upload_request_id is not null then return jsonb_build_object('status','DISPATCHED','requestId',i.upload_request_id); end if;
 t:=public.content_pipeline_issue_asset_upload_ticket_v1(i.pipeline_id,i.asset_key);
 select net.http_post(url:='https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-staging',
 headers:=jsonb_build_object('content-type','application/json','x-fitbike-upload-ticket',t->>'ticket'),
 body:=jsonb_build_object('mode','publish','pipelineImageId',i.pipeline_image_id,'claimToken',p_claim_token),timeout_milliseconds:=60000) into v_id;
 update public."21_content_pipeline_image" set upload_request_id=v_id,upload_dispatched_at=now() where pipeline_image_id=i.pipeline_image_id;
 return jsonb_build_object('status','DISPATCHED','requestId',v_id);
end $$;

create or replace function public.content_pipeline_return_image_production_v1(p_pipeline_image_id bigint,p_claim_token uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; v_run bigint; v_result jsonb;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found or i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token then raise exception 'INVALID_IMAGE_CLAIM'; end if;
 select pipeline_image_run_id into v_run from public."23_content_pipeline_image_run" where pipeline_image_id=i.pipeline_image_id and claim_token=p_claim_token and status='RUNNING';
 v_result:=public.content_pipeline_fail_image_v1(i.pipeline_image_id,v_run,p_claim_token,'RETRY','SEMANTIC_QA','RETURN_TO_IMAGE_PRODUCTION',p_reason,'REPRODUCE_IMAGE',null,null,null,null,jsonb_build_object('preservedStagingAsset',i.staging_asset));
 update public."21_content_pipeline_image" set staging_asset=null,handoff_phase='RETURN_TO_IMAGE_PRODUCTION' where pipeline_image_id=i.pipeline_image_id;
 return v_result;
end $$;

create or replace function public.content_pipeline_image_handoff_status_v1(p_pipeline_id bigint default null)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('pipelineId',i.pipeline_id,'pipelineImageId',i.pipeline_image_id,
 'contentKey',p.content_key,'imageId',i.image_id,'assetKey',i.asset_key,'status',i.status,'handoffPhase',i.handoff_phase,
 'stagingSha',i.staging_asset->>'sha256','stagingPath',i.staging_asset->>'path','mobileQa',i.staging_asset->'qa'->>'mobileQa',
 'imageQa',i.staging_asset->'qa'->>'imageQa','productionPath',i.storage_path,'productionSha',i.sha256,
 'failureStage',i.failure_stage,'failureCode',i.failure_code,'lastError',i.last_error,'nextEligibleAt',i.next_eligible_at,
 'updatedAt',i.updated_at,'contentStage',p.stage) order by i.updated_at desc),'[]'::jsonb)
 from (select * from public."21_content_pipeline_image" where p_pipeline_id is null or pipeline_id=p_pipeline_id order by updated_at desc limit 100) i
 join public."18_content_pipeline" p on p.pipeline_id=i.pipeline_id;
$$;
CREATE OR REPLACE FUNCTION public.content_pipeline_complete_image_v1(p_pipeline_image_id bigint, p_pipeline_image_run_id bigint, p_claim_token uuid, p_generation_status text, p_qa_status text, p_file_status text, p_upload_status text, p_storage_bucket text, p_storage_path text, p_sha256 text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 i public."21_content_pipeline_image"%rowtype;
 v_required int; v_done int; v_manifest jsonb;
 v_dup public."21_content_pipeline_image"%rowtype;
 v_source_url text := nullif(p_metadata->>'sourceAssetUrl','');
 v_dup_source_image_id text;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_IMAGE_NOT_FOUND'; end if;
 if i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token then
   raise exception using errcode='40001',message='CONTENT_PIPELINE_IMAGE_CLAIM_CONFLICT';
 end if;
 if i.handoff_phase in ('PRODUCING','STAGING','RETURN_TO_IMAGE_PRODUCTION') and i.staging_asset is null then raise exception 'STAGING_REQUIRED_USE_3A'; end if;
 if i.staging_asset is not null then
   if not exists(select 1 from public."23_content_pipeline_image_run" where pipeline_image_run_id=p_pipeline_image_run_id
    and pipeline_image_id=i.pipeline_image_id and claim_token=p_claim_token and status='RUNNING') then raise exception 'IMAGE_RUN_MISSING'; end if;
   if p_storage_bucket is distinct from 'content-assets' or p_storage_path is distinct from
    'contents/'||(select content_key from public."18_content_pipeline" where pipeline_id=i.pipeline_id)||'/'||i.asset_key||'-'||left(p_sha256,12)||'.webp'
   then raise exception 'PRODUCTION_PATH_IDENTITY_REQUIRED'; end if;
   if i.claim_expires_at<=now() or i.staging_asset->>'sha256' is distinct from p_sha256
    or p_metadata->'finalRenderVerification'->>'status' is distinct from 'PASS'
    or p_metadata->'finalRenderVerification'->>'sha256' is distinct from p_sha256
    or p_metadata->'finalRenderVerification'->>'decode' is distinct from 'PASS'
    or p_metadata->'storageVerification'->>'status' is distinct from 'PASS'
    or p_metadata->'storageVerification'->>'sha256' is distinct from p_sha256
    or p_metadata->'finalRenderVerification'->>'mime' is distinct from 'image/webp'
    or p_metadata->'finalRenderVerification'->>'signature' is distinct from 'RIFF/WEBP'
    or p_metadata->'finalRenderVerification'->>'httpStatus' is distinct from '200'
    or (p_metadata->'finalRenderVerification'->>'width')::int is distinct from (i.staging_asset->>'width')::int
    or (p_metadata->'finalRenderVerification'->>'height')::int is distinct from (i.staging_asset->>'height')::int
    or (p_metadata->'finalRenderVerification'->>'bytes')::int is distinct from (i.staging_asset->>'bytes')::int
   then raise exception 'FINAL_ASSET_IDENTITY_REQUIRED'; end if;
 end if;
 if p_generation_status<>'PASS' or p_qa_status<>'PASS' or p_file_status<>'PASS' or p_upload_status not in ('UPLOADED','REUSED') then
   raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_NOT_COMPLETE';
 end if;
 if p_storage_bucket is null or p_storage_path is null or p_sha256 is null then
   raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_STORAGE_VERIFY_REQUIRED';
 end if;
 if upper(coalesce(i.image_brief->>'asset_role',i.image_brief->'image_brief'->>'asset_role','BODY')) in ('THUMBNAIL','HERO','THUMBNAIL_HERO') then
   if coalesce(p_metadata->>'representativeImageQa','FAIL')<>'PASS' then
     raise exception using errcode='22023',message='CONTENT_PIPELINE_REPRESENTATIVE_IMAGE_QA_REQUIRED';
   end if;
   if upper(coalesce(i.image_brief->>'asset_role',i.image_brief->'image_brief'->>'asset_role')) in ('THUMBNAIL','THUMBNAIL_HERO') and coalesce(p_metadata->>'cardCropQa','FAIL')<>'PASS' then
     raise exception using errcode='22023',message='CONTENT_PIPELINE_CARD_CROP_QA_REQUIRED';
   end if;
   if upper(coalesce(i.image_brief->>'asset_role',i.image_brief->'image_brief'->>'asset_role')) in ('HERO','THUMBNAIL_HERO') and coalesce(p_metadata->>'heroCropQa','FAIL')<>'PASS' then
     raise exception using errcode='22023',message='CONTENT_PIPELINE_HERO_CROP_QA_REQUIRED';
   end if;
 end if;

 select * into v_dup
 from public."21_content_pipeline_image"
 where pipeline_id=i.pipeline_id and pipeline_image_id<>i.pipeline_image_id
   and status='DONE' and sha256=p_sha256
 limit 1;
 if found then
   raise exception using errcode='23505',
     message='CONTENT_PIPELINE_DUPLICATE_VISUAL_ASSET',
     detail=format('current=%s duplicate=%s sha256=%s',i.image_id,v_dup.image_id,p_sha256);
 end if;

 if v_source_url is not null then
   select pi.image_id into v_dup_source_image_id
   from public."21_content_pipeline_image" pi
   join lateral (
     select r.metadata
     from public."23_content_pipeline_image_run" r
     where r.pipeline_image_id=pi.pipeline_image_id and r.status='PASS'
     order by r.completed_at desc nulls last, r.pipeline_image_run_id desc
     limit 1
   ) rr on true
   where pi.pipeline_id=i.pipeline_id and pi.pipeline_image_id<>i.pipeline_image_id
     and pi.status='DONE' and nullif(rr.metadata->>'sourceAssetUrl','')=v_source_url
   limit 1;
   if v_dup_source_image_id is not null then
     raise exception using errcode='23505',
       message='CONTENT_PIPELINE_DUPLICATE_SOURCE_ASSET',
       detail=format('current=%s duplicate=%s sourceAssetUrl=%s',i.image_id,v_dup_source_image_id,v_source_url);
   end if;
 end if;

 update public."21_content_pipeline_image"
 set status='DONE',handoff_phase=case when staging_asset is not null then 'DONE' else handoff_phase end,generation_status=p_generation_status,qa_status=p_qa_status,file_status=p_file_status,
     upload_status=p_upload_status,storage_bucket=p_storage_bucket,storage_path=p_storage_path,sha256=p_sha256,
     claimed_by=null,claim_token=null,claimed_at=null,claim_expires_at=null,
     retry_action=null,failure_stage=null,failure_code=null,last_error=null,completed_at=now(),updated_at=now()
 where pipeline_image_id=p_pipeline_image_id returning * into i;

 update public."23_content_pipeline_image_run"
 set status='PASS',completed_at=now(),summary='DONE',metadata=coalesce(p_metadata,'{}'::jsonb)
 where pipeline_image_run_id=p_pipeline_image_run_id and pipeline_image_id=p_pipeline_image_id
   and claim_token=p_claim_token and status='RUNNING';

 select count(*),count(*) filter(where status='DONE') into v_required,v_done
 from public."21_content_pipeline_image" where pipeline_id=i.pipeline_id and status<>'CANCELLED';

 select coalesce(jsonb_agg(image_brief || jsonb_build_object(
   'image_id',image_id,'asset_key',asset_key,'status',status,'generation_status',generation_status,
   'qa_status',qa_status,'file_status',file_status,'upload_status',upload_status,
   'storage_bucket',storage_bucket,'storage_path',storage_path,'sha256',sha256,'completed_at',completed_at
 ) order by ordinal),'[]'::jsonb) into v_manifest
 from public."21_content_pipeline_image" where pipeline_id=i.pipeline_id and status<>'CANCELLED';

 update public."18_content_pipeline"
 set image_manifest=v_manifest,
     stage=case when public.content_pipeline_image_role_coverage_ready_v1(i.pipeline_id) then 'IMAGE_READY' else 'VISUAL' end,
     updated_at=now()
 where pipeline_id=i.pipeline_id and ownership_state='CLAIMED';

 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'status','DONE','pipelineId',i.pipeline_id,
   'readyImageCount',v_done,'requiredImageCount',v_required,
   'contentStage',case when public.content_pipeline_image_role_coverage_ready_v1(i.pipeline_id) then 'IMAGE_READY' else 'VISUAL' end);
end $function$
;
do $$ declare r record; begin
 for r in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in
 ('content_pipeline_claim_asset_publisher_v1','content_pipeline_record_staging_v1','content_pipeline_dispatch_staging_v1',
 'content_pipeline_dispatch_asset_publisher_v1','content_pipeline_return_image_production_v1','content_pipeline_image_handoff_status_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);
 execute format('grant execute on function %s to service_role',r.signature);
 end loop;
end $$;
