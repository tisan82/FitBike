-- Align scheduled image queue with Writer artifact and upload-ticket validation.

create or replace function public.content_pipeline_sync_images_v1(p_pipeline_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public."18_content_pipeline"%rowtype; v_count int; v_item jsonb; v_items jsonb; v_ord int:=0; v_asset text; v_image text;
begin
 select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_NOT_FOUND'; end if;
 if p.ownership_state<>'CLAIMED' then raise exception using errcode='22023',message='CONTENT_PIPELINE_NOT_CLAIMED'; end if;
 if p.stage not in ('DRAFTED','VISUAL','IMAGE_READY') then raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGES_NOT_AVAILABLE'; end if;
 v_items:=case
   when jsonb_typeof(p.writer_artifact->'image_briefs')='array' then p.writer_artifact->'image_briefs'
   when jsonb_typeof(p.writer_artifact->'image_manifest')='array' then p.writer_artifact->'image_manifest'
   else '[]'::jsonb end;
 for v_item in select value from jsonb_array_elements(v_items) loop
   v_asset:=coalesce(v_item->>'asset_key',case when v_ord=0 then 'thumbnail' when v_ord=1 then 'hero' else 'body-'||lpad((v_ord-1)::text,2,'0') end);
   v_image:=coalesce(nullif(v_item->>'image_id',''),'IMAGE_'||lpad((v_ord+1)::text,2,'0'));
   if v_asset !~ '^(thumbnail|hero|body-[0-9]{2})$' then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_IMAGE_ASSET_KEY'; end if;
   insert into public."21_content_pipeline_image"(pipeline_id,image_id,asset_key,ordinal,image_brief)
   values(p_pipeline_id,v_image,v_asset,v_ord,v_item)
   on conflict (pipeline_id,asset_key) do update set image_id=excluded.image_id,ordinal=excluded.ordinal,
     image_brief=case when public."21_content_pipeline_image".status in ('PENDING','RETRY') then excluded.image_brief else public."21_content_pipeline_image".image_brief end,
     updated_at=now();
   v_ord:=v_ord+1;
 end loop;
 select count(*) into v_count from public."21_content_pipeline_image" where pipeline_id=p_pipeline_id;
 return jsonb_build_object('pipelineId',p_pipeline_id,'requiredImageCount',v_count);
end $$;

create or replace function public.content_pipeline_issue_asset_upload_ticket_v1(p_pipeline_id bigint,p_asset_key text)
returns jsonb language plpgsql security definer set search_path='public','extensions' as $$
declare v_pipeline public."18_content_pipeline"%rowtype; v_token text; v_expires_at timestamptz:=now()+interval '15 minutes';
begin
 if p_asset_key !~ '^(thumbnail|hero|body-[0-9]{2})$' then raise exception 'INVALID_ASSET_KEY'; end if;
 select * into v_pipeline from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 if not found then raise exception 'PIPELINE_NOT_FOUND'; end if;
 if v_pipeline.ownership_state<>'CLAIMED' then raise exception 'PIPELINE_NOT_CLAIMED'; end if;
 if v_pipeline.content_key is null then raise exception 'CONTENT_KEY_MISSING'; end if;
 if not exists(select 1 from public."21_content_pipeline_image" i
   where i.pipeline_id=p_pipeline_id and i.asset_key=p_asset_key and i.status='PROCESSING' and i.claim_token is not null)
 then raise exception 'ASSET_NOT_CLAIMED'; end if;
 delete from public."20_content_pipeline_asset_upload_ticket" where expires_at<now() or consumed_at is not null;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public."20_content_pipeline_asset_upload_ticket"(pipeline_id,asset_key,token_hash,expires_at)
 values(p_pipeline_id,p_asset_key,extensions.digest(v_token,'sha256'),v_expires_at);
 return jsonb_build_object('pipelineId',p_pipeline_id,'contentKey',v_pipeline.content_key,'assetKey',p_asset_key,'ticket',v_token,'expiresAt',v_expires_at);
end $$;

revoke all on function public.content_pipeline_sync_images_v1(bigint) from public,anon,authenticated;
revoke all on function public.content_pipeline_issue_asset_upload_ticket_v1(bigint,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_sync_images_v1(bigint) to service_role;
grant execute on function public.content_pipeline_issue_asset_upload_ticket_v1(bigint,text) to service_role;
