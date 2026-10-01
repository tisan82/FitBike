-- Provenance-only operator policy; preserve historical rights values.
alter table public."17_content_asset_source" alter column rights_status drop not null;
alter table public."17_content_asset_source" alter column rights_status drop default;
CREATE OR REPLACE FUNCTION public.content_pipeline_publish_v1(p_pipeline_id bigint, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 p public."18_content_pipeline"%rowtype; topic_row public."16_content_topic"%rowtype;
 new_content_id bigint; v_content_key text:=p_payload#>>'{content,contentKey}';
 v_topic_key text:=p_payload->>'topicKey'; v_content_type text:=p_payload#>>'{content,contentType}';
 v_published_at timestamptz; source jsonb; relation jsonb; existing_id bigint;
 v_path text; v_sha text; v_asset_key text; v_suffix text; v_image public."21_content_pipeline_image"%rowtype;
 v_seo jsonb:=coalesce(p_payload->'seoContract',p_payload#>'{content,seoContract}','{}'::jsonb);
begin
 if jsonb_typeof(p_payload)<>'object' then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_PAYLOAD'; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 if not found or p.stage<>'PUBLISHING' or p.ownership_state<>'CLAIMED' then raise exception using errcode='40001',message='CONTENT_PIPELINE_NOT_PUBLISHABLE'; end if;
 if p.topic_key<>v_topic_key then raise exception using errcode='22023',message='CONTENT_PIPELINE_TOPIC_MISMATCH'; end if;
 select * into topic_row from public."16_content_topic" where content_topic_id=p.content_topic_id;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_TOPIC_NOT_FOUND'; end if;
 if topic_row.content_id is not null or topic_row.status='PUBLISHED' then raise exception using errcode='40001',message='CONTENT_PIPELINE_TOPIC_ALREADY_PUBLISHED'; end if;
 if topic_row.content_type<>v_content_type then raise exception using errcode='22023',message='CONTENT_PIPELINE_CONTENT_TYPE_MISMATCH'; end if;
 if v_content_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_CONTENT_KEY'; end if;
 select content_id into existing_id from public."12_content" where content_key=v_content_key;
 if existing_id is not null then raise exception using errcode='23505',message='CONTENT_PIPELINE_CONTENT_KEY_EXISTS'; end if;
 v_published_at:=(p_payload#>>'{content,publishedAt}')::timestamptz;
 if v_published_at>now()+interval '1 minute' then raise exception using errcode='22023',message='CONTENT_PIPELINE_FUTURE_PUBLICATION'; end if;
 for source in select value from jsonb_array_elements(coalesce(p_payload->'assetSources','[]'::jsonb)) loop
   v_path:=source->>'storagePath'; v_sha:=lower(source->>'sha256'); v_asset_key:=source->>'assetKey';
   if v_path is not null then
     if v_path !~ ('^contents/'||v_content_key||'/(thumbnail|hero|body-[0-9]{2})(-[0-9a-f]{12})?[.]webp$')
     then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_STORAGE_PATH'; end if;
     if v_sha is null or v_sha !~ '^[0-9a-f]{64}$'
     then raise exception using errcode='22023',message='CONTENT_PIPELINE_ASSET_SHA_REQUIRED'; end if;
     v_suffix:=substring(v_path from '-([0-9a-f]{12})[.]webp$');
     if v_suffix is not null and v_suffix<>substring(v_sha from 1 for 12)
     then raise exception using errcode='22023',message='CONTENT_PIPELINE_ASSET_SHA_PATH_MISMATCH'; end if;
     select * into v_image from public."21_content_pipeline_image"
       where pipeline_id=p_pipeline_id and asset_key=v_asset_key and status='DONE'
       and qa_status='PASS' and file_status='PASS' and upload_status in ('UPLOADED','REUSED')
       and storage_path=v_path and lower(sha256)=v_sha limit 1;
     if not found then raise exception using errcode='22023',message='CONTENT_PIPELINE_ASSET_NOT_QA_VERIFIED'; end if;
     if not exists(select 1 from storage.objects o where o.bucket_id='content-assets' and o.name=v_path)
     then raise exception using errcode='22023',message='CONTENT_PIPELINE_STORAGE_OBJECT_MISSING'; end if;
   end if;
 end loop;
 insert into public."12_content"(content_key,title,summary,content_type,thumbnail_image_storage_path,hero_image_storage_path,body_blocks,is_active,published_at,seo_title,h1,meta_description,thumbnail_alt,hero_alt)
 values(v_content_key,p_payload#>>'{content,title}',p_payload#>>'{content,summary}',v_content_type,p_payload#>>'{content,thumbnailImageStoragePath}',p_payload#>>'{content,heroImageStoragePath}',p_payload#>'{content,bodyBlocks}',true,v_published_at,
 nullif(v_seo->>'seo_title',''),nullif(v_seo->>'h1',''),nullif(v_seo->>'meta_description',''),nullif(v_seo->>'thumbnail_alt',''),nullif(v_seo->>'hero_alt',''))
 returning content_id into new_content_id;
 insert into public."13_content_bike_model"(content_id,bike_model_id) select new_content_id,value::bigint from jsonb_array_elements_text(coalesce(p_payload#>'{relations,bikeModelIds}','[]'::jsonb));
 insert into public."14_content_bike_model_year"(content_id,bike_model_year_id) select new_content_id,value::bigint from jsonb_array_elements_text(coalesce(p_payload#>'{relations,bikeModelYearIds}','[]'::jsonb));
 for relation in select value from jsonb_array_elements(coalesce(p_payload#>'{relations,parts}','[]'::jsonb)) loop
   if relation->>'partType' is null or relation->>'partType' not in ('TIRE','BATTERY','BRAKE') or relation->>'scopeType' is null or relation->>'scopeType'<>'CATEGORY'
   then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_PART_RELATION'; end if;
   insert into public."15_content_part_link"(content_id,part_type,scope_type,display_order,is_active) values(new_content_id,relation->>'partType','CATEGORY',(select count(*) from public."15_content_part_link" where content_id=new_content_id),true);
 end loop;
 for source in select value from jsonb_array_elements(coalesce(p_payload->'assetSources','[]'::jsonb)) loop
   insert into public."17_content_asset_source"(content_id,content_key,asset_role,asset_key,storage_path,source_type,source_page_url,source_asset_url,source_owner,license_name,license_url,permission_contact,permission_note,rights_status,edited,edit_description,used_in_service,first_used_at,last_checked_at)
   values(new_content_id,v_content_key,source->>'assetRole',source->>'assetKey',source->>'storagePath',source->>'sourceType',source->>'sourcePageUrl',source->>'sourceAssetUrl',source->>'sourceOwner',null,null,null,null,null,coalesce((source->>'edited')::boolean,false),source->>'editDescription',coalesce((source->>'usedInService')::boolean,true),case when coalesce((source->>'usedInService')::boolean,true) then now() else null end,(source->>'lastCheckedAt')::timestamptz);
 end loop;
 update public."18_content_pipeline" set content_id=new_content_id,content_key=v_content_key,updated_at=now() where pipeline_id=p_pipeline_id;
 return jsonb_build_object('status','PUBLISHED','contentId',new_content_id,'contentKey',v_content_key);
end $function$
;
CREATE OR REPLACE FUNCTION public.content_pipeline_dispatch_source_stage_v1(p_spec jsonb, p_pipeline_image_id bigint DEFAULT NULL::bigint, p_claim_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j uuid;t text;r bigint;i public."21_content_pipeline_image"%rowtype;h text;
begin
 p_spec:=p_spec - array['rightsStatus','rights_status','rightsEvidence','licenseName','licenseUrl','permissionContact','permissionNote'];
 if jsonb_typeof(p_spec) is distinct from 'object' or length(p_spec::text)>16000 or p_spec->>'sourceAssetUrl' is null or jsonb_typeof(p_spec->'transform') is distinct from 'object' then raise exception 'INVALID_SOURCE_SPEC';end if;
 if (p_pipeline_image_id is null)<>(p_claim_token is null) then raise exception 'INVALID_IMAGE_CLAIM';end if;
 if p_pipeline_image_id is not null then
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id;
 if not found or i.status<>'PROCESSING' or i.handoff_phase is distinct from 'PRODUCING' or i.claim_token is distinct from p_claim_token or i.claim_expires_at<=now() then raise exception 'INVALID_IMAGE_CLAIM';end if;
 if not exists(select 1 from public."18_content_pipeline" p where p.pipeline_id=i.pipeline_id and p.ownership_state='CLAIMED' and p.stage in('DRAFTED','VISUAL')) then raise exception 'INVALID_PIPELINE_STATE';end if;h:=i.generation_contract_hash;
 end if;
 t:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public."27_content_pipeline_source_stage_job"(pipeline_image_id,claim_token,contract_hash,spec,token_hash) values(p_pipeline_image_id,p_claim_token,h,p_spec,extensions.digest(t,'sha256')) returning job_id into j;
 select net.http_post(url:='https://farjyjcvduthawpdjuqe.supabase.co/functions/v1/content-pipeline-source-stage',headers:=jsonb_build_object('content-type','application/json','x-fitbike-source-stage-ticket',t),body:=jsonb_build_object('jobId',j),timeout_milliseconds:=60000) into r;
 update public."27_content_pipeline_source_stage_job" set request_id=r where job_id=j;
 return jsonb_build_object('jobId',j,'requestId',r,'status','DISPATCHED','probeOnly',p_pipeline_image_id is null);
end $function$
;
