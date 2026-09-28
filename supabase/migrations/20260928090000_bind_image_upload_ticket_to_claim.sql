-- Bind upload tickets to the active image claim and close stale image runs on reclaim.
alter table public."20_content_pipeline_asset_upload_ticket" add column if not exists claim_token uuid;

create or replace function public.content_pipeline_claim_image_v1(p_worker_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype; v_token uuid:=extensions.gen_random_uuid(); v_run bigint; v_old_token uuid;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_WORKER_KEY'; end if;
 for p in select * from public."18_content_pipeline" where ownership_state='CLAIMED' and stage in ('DRAFTED','VISUAL') order by updated_at,pipeline_id loop perform public.content_pipeline_sync_images_v1(p.pipeline_id); end loop;
 select i0.* into i from public."21_content_pipeline_image" i0 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id
 where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL')
 and (i0.status in ('PENDING','RETRY') or (i0.status='PROCESSING' and i0.claim_expires_at<now()))
 order by case i0.status when 'RETRY' then 0 when 'PROCESSING' then 1 else 2 end,p0.updated_at,i0.pipeline_id,i0.ordinal
 for update of i0 skip locked limit 1;
 if not found then return null; end if;
 v_old_token:=i.claim_token;
 if i.status='PROCESSING' and i.claim_expires_at<now() and v_old_token is not null then
   update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_EXPIRED',
   error='Image claim TTL expired before Complete/Fail RPC.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reclaimedAt',now())
   where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status='RUNNING';
 end if;
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage='DRAFTED';
 update public."21_content_pipeline_image" set status='PROCESSING',claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),
 claim_expires_at=now()+interval '20 minutes',attempt_count=attempt_count+1,failure_stage=null,failure_code=null,last_error=null,updated_at=now()
 where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status)
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING') returning pipeline_image_run_id into v_run;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,'pipelineId',i.pipeline_id,
 'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,'ordinal',i.ordinal,'attemptNo',i.attempt_count,
 'imageBrief',i.image_brief,'writerArtifact',p.writer_artifact,'researchArtifact',p.research_artifact);
end $$;

create or replace function public.content_pipeline_issue_asset_upload_ticket_v1(p_pipeline_id bigint,p_asset_key text)
returns jsonb language plpgsql security definer set search_path='public','extensions' as $$
declare v_pipeline public."18_content_pipeline"%rowtype; v_image public."21_content_pipeline_image"%rowtype; v_token text; v_expires_at timestamptz:=now()+interval '15 minutes';
begin
 if p_asset_key !~ '^(thumbnail|hero|body-[0-9]{2})$' then raise exception 'INVALID_ASSET_KEY'; end if;
 select * into v_pipeline from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 if not found then raise exception 'PIPELINE_NOT_FOUND'; end if;
 if v_pipeline.ownership_state<>'CLAIMED' then raise exception 'PIPELINE_NOT_CLAIMED'; end if;
 if v_pipeline.content_key is null then raise exception 'CONTENT_KEY_MISSING'; end if;
 select * into v_image from public."21_content_pipeline_image" where pipeline_id=p_pipeline_id and asset_key=p_asset_key
 and status='PROCESSING' and claim_token is not null and claim_expires_at>now() for update;
 if not found then raise exception 'ASSET_NOT_ACTIVELY_CLAIMED'; end if;
 delete from public."20_content_pipeline_asset_upload_ticket" where expires_at<now() or consumed_at is not null;
 v_token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into public."20_content_pipeline_asset_upload_ticket"(pipeline_id,asset_key,token_hash,expires_at,claim_token)
 values(p_pipeline_id,p_asset_key,extensions.digest(v_token,'sha256'),v_expires_at,v_image.claim_token);
 return jsonb_build_object('pipelineId',p_pipeline_id,'contentKey',v_pipeline.content_key,'assetKey',p_asset_key,'ticket',v_token,'expiresAt',v_expires_at);
end $$;

create or replace function public.content_pipeline_consume_asset_upload_ticket_v1(p_pipeline_id bigint,p_content_key text,p_asset_key text,p_ticket text)
returns boolean language plpgsql security definer set search_path='public','extensions' as $$
declare v_ticket_id bigint;
begin
 if p_ticket is null or length(p_ticket)<32 then return false; end if;
 select t.ticket_id into v_ticket_id from public."20_content_pipeline_asset_upload_ticket" t
 join public."18_content_pipeline" p on p.pipeline_id=t.pipeline_id
 join public."21_content_pipeline_image" i on i.pipeline_id=t.pipeline_id and i.asset_key=t.asset_key
 where t.pipeline_id=p_pipeline_id and p.content_key=p_content_key and p.ownership_state='CLAIMED' and t.asset_key=p_asset_key
 and t.consumed_at is null and t.expires_at>now() and t.token_hash=extensions.digest(p_ticket,'sha256')
 and t.claim_token=i.claim_token and i.status='PROCESSING' and i.claim_expires_at>now() for update of t;
 if not found then return false; end if;
 update public."20_content_pipeline_asset_upload_ticket" set consumed_at=now() where ticket_id=v_ticket_id;
 return true;
end $$;

revoke all on function public.content_pipeline_claim_image_v1(text) from public,anon,authenticated;
revoke all on function public.content_pipeline_issue_asset_upload_ticket_v1(bigint,text) from public,anon,authenticated;
revoke all on function public.content_pipeline_consume_asset_upload_ticket_v1(bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.content_pipeline_claim_image_v1(text) to service_role;
grant execute on function public.content_pipeline_issue_asset_upload_ticket_v1(bigint,text) to service_role;
grant execute on function public.content_pipeline_consume_asset_upload_ticket_v1(bigint,text,text,text) to service_role;
