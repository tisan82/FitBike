-- Align Stage 4 publish validation with the immutable Storage contract.
-- Production was updated first to unblock pipeline 10; this migration preserves that contract in source control.
-- Publish validates the exact Image Task storage_path + sha256. New immutable paths additionally require sha12 suffix consistency.
-- Legacy pre-transition Image Tasks remain publishable only when their exact recorded path + full SHA are QA-verified.

create or replace function public.content_pipeline_publish_v1(p_pipeline_id bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
 p public."18_content_pipeline"%rowtype; topic_row public."16_content_topic"%rowtype;
 new_content_id bigint; v_content_key text:=p_payload#>>'{content,contentKey}';
 v_topic_key text:=p_payload->>'topicKey'; v_content_type text:=p_payload#>>'{content,contentType}';
 v_published_at timestamptz; source jsonb; relation jsonb; existing_id bigint;
 v_path text; v_sha text; v_asset_key text; v_suffix text; v_image public."21_content_pipeline_image"%rowtype;
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
   if source->>'rightsStatus' is null or source->>'rightsStatus' not in ('OWNED_APPROVED','LICENSED_APPROVED','PERMISSION_CONFIRMED','NOT_REQUIRED')
   then raise exception using errcode='22023',message='CONTENT_PIPELINE_UNAPPROVED_ASSET_SOURCE'; end if;
   v_path:=source->>'storagePath'; v_sha:=lower(source->>'sha256'); v_asset_key:=source->>'assetKey';
   if v_path is not null then
     if v_path !~ ('^contents/'||v_content_key||'/(thumbnail|hero|body-[0-9]{2})(-[0-9a-f]{12})?[.]webp$')
     then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_STORAGE_PATH'; end if;
     if v_sha is null or v_sha !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='CONTENT_PIPELINE_ASSET_SHA_REQUIRED'; end if;
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
 insert into public."12_content"(content_key,title,summary,content_type,thumbnail_image_storage_path,hero_image_storage_path,body_blocks,is_active,published_at)
 values(v_content_key,p_payload#>>'{content,title}',p_payload#>>'{content,summary}',v_content_type,p_payload#>>'{content,thumbnailImageStoragePath}',p_payload#>>'{content,heroImageStoragePath}',p_payload#>'{content,bodyBlocks}',true,v_published_at) returning content_id into new_content_id;
 insert into public."13_content_bike_model"(content_id,bike_model_id) select new_content_id,value::bigint from jsonb_array_elements_text(coalesce(p_payload#>'{relations,bikeModelIds}','[]'::jsonb));
 insert into public."14_content_bike_model_year"(content_id,bike_model_year_id) select new_content_id,value::bigint from jsonb_array_elements_text(coalesce(p_payload#>'{relations,bikeModelYearIds}','[]'::jsonb));
 for relation in select value from jsonb_array_elements(coalesce(p_payload#>'{relations,parts}','[]'::jsonb)) loop
   if relation->>'partType' is null or relation->>'partType' not in ('TIRE','BATTERY','BRAKE') or relation->>'scopeType' is null or relation->>'scopeType'<>'CATEGORY'
   then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_PART_RELATION'; end if;
   insert into public."15_content_part_link"(content_id,part_type,scope_type,display_order,is_active)
   values(new_content_id,relation->>'partType','CATEGORY',(select count(*) from public."15_content_part_link" where content_id=new_content_id),true);
 end loop;
 for source in select value from jsonb_array_elements(coalesce(p_payload->'assetSources','[]'::jsonb)) loop
   insert into public."17_content_asset_source"(content_id,content_key,asset_role,asset_key,storage_path,source_type,source_page_url,source_asset_url,source_owner,license_name,license_url,permission_contact,permission_note,rights_status,edited,edit_description,used_in_service,first_used_at,last_checked_at)
   values(new_content_id,v_content_key,source->>'assetRole',source->>'assetKey',source->>'storagePath',source->>'sourceType',source->>'sourcePageUrl',source->>'sourceAssetUrl',source->>'sourceOwner',source->>'licenseName',source->>'licenseUrl',source->>'permissionContact',source->>'permissionNote',source->>'rightsStatus',coalesce((source->>'edited')::boolean,false),source->>'editDescription',coalesce((source->>'usedInService')::boolean,true),case when coalesce((source->>'usedInService')::boolean,true) then now() else null end,(source->>'lastCheckedAt')::timestamptz);
 end loop;
 update public."18_content_pipeline" set content_id=new_content_id,content_key=v_content_key,updated_at=now() where pipeline_id=p_pipeline_id;
 return jsonb_build_object('status','PUBLISHED','contentId',new_content_id,'contentKey',v_content_key);
end $function$;
