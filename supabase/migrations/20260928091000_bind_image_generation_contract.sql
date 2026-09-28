-- Bind every scheduled image claim to a fresh, immutable generation/acquisition contract.
alter table public."21_content_pipeline_image"
  add column if not exists generation_contract jsonb,
  add column if not exists generation_contract_hash text,
  add column if not exists brief_mismatch_count integer not null default 0,
  add column if not exists next_eligible_at timestamptz;

-- Contract builder normalizes legacy nested briefs and prevents cross-content prompt inheritance.
create or replace function public.content_pipeline_build_image_generation_contract_v1(p_pipeline_image_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype; b jsonb; inner_b jsonb; c jsonb;
begin
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_IMAGE_NOT_FOUND'; end if;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 b:=coalesce(i.image_brief,'{}'::jsonb);
 inner_b:=case when jsonb_typeof(b->'image_brief')='object' then b->'image_brief' else b end;
 c:=jsonb_strip_nulls(jsonb_build_object(
  'contract_version',1,'pipeline_image_id',i.pipeline_image_id,'pipeline_id',i.pipeline_id,
  'content_key',p.content_key,'topic_key',p.topic_key,'image_id',i.image_id,'asset_key',i.asset_key,
  'role',coalesce(inner_b->>'role',b->>'role'),'subject',inner_b->>'subject','scene',inner_b->'scene',
  'visual_objective',coalesce(inner_b->>'visual_objective',b->>'visual_objective'),
  'user_question_supported',coalesce(inner_b->>'user_question_supported',inner_b->>'user_question',b->>'user_question'),
  'source_strategy',coalesce(inner_b->>'source_strategy',b->>'source_strategy'),
  'generation_allowed',coalesce((inner_b->>'generation_allowed')::boolean,(b->>'generation_allowed')::boolean,false),
  'must_show',coalesce(inner_b->'must_show','[]'::jsonb),
  'must_not_show',coalesce(inner_b->'must_not_show',inner_b->'prohibited','[]'::jsonb),
  'fact_dependencies',coalesce(inner_b->'fact_dependencies','[]'::jsonb),
  'safety_dependencies',coalesce(inner_b->'safety_dependencies','[]'::jsonb),
  'text_in_image',inner_b->'text_in_image','mobile_requirement',coalesce(inner_b->>'mobile_requirement',b->>'mobile_requirement'),
  'preferred_orientation',inner_b->>'preferred_orientation','alt_text_draft',coalesce(inner_b->>'alt_text_draft',b->>'alt_text_draft'),
  'content_isolation_rule','Use only this generation contract for this image. Do not inherit subject, scene, objects, text, layout, prior generated image, or visual prompt from any other content or image task.'
 ));
 if coalesce(c->>'content_key','')='' or coalesce(c->>'image_id','')='' or coalesce(c->>'asset_key','')='' then
  raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_CONTRACT_INCOMPLETE';
 end if;
 return c;
end $$;

-- Claim now returns only the normalized generation contract rather than broad Writer/Research artifacts.
create or replace function public.content_pipeline_claim_image_v1(p_worker_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; p public."18_content_pipeline"%rowtype; v_token uuid:=extensions.gen_random_uuid(); v_run bigint; v_old_token uuid; v_contract jsonb; v_hash text;
begin
 if p_worker_key is null or length(trim(p_worker_key))<1 or length(p_worker_key)>100 then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_WORKER_KEY'; end if;
 for p in select * from public."18_content_pipeline" where ownership_state='CLAIMED' and stage in ('DRAFTED','VISUAL') order by updated_at,pipeline_id loop perform public.content_pipeline_sync_images_v1(p.pipeline_id); end loop;
 select i0.* into i from public."21_content_pipeline_image" i0 join public."18_content_pipeline" p0 on p0.pipeline_id=i0.pipeline_id
 where p0.ownership_state='CLAIMED' and p0.stage in ('DRAFTED','VISUAL')
 and coalesce(i0.next_eligible_at,'-infinity'::timestamptz)<=now()
 and (i0.status in ('PENDING','RETRY') or (i0.status='PROCESSING' and i0.claim_expires_at<now()))
 order by case i0.status when 'PENDING' then 0 when 'PROCESSING' then 1 else 2 end,
 coalesce(i0.next_eligible_at,'-infinity'::timestamptz),p0.updated_at,i0.pipeline_id,i0.ordinal
 for update of i0 skip locked limit 1;
 if not found then return null; end if;
 v_old_token:=i.claim_token;
 if i.status='PROCESSING' and i.claim_expires_at<now() and v_old_token is not null then
  update public."23_content_pipeline_image_run" set status='FAILED',completed_at=now(),failure_stage='CLAIM',failure_code='CLAIM_EXPIRED',
  error='Image claim TTL expired before Complete/Fail RPC.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('reclaimedAt',now())
  where pipeline_image_id=i.pipeline_image_id and claim_token=v_old_token and status='RUNNING';
 end if;
 v_contract:=public.content_pipeline_build_image_generation_contract_v1(i.pipeline_image_id);
 v_hash:=encode(extensions.digest(convert_to(v_contract::text,'UTF8'),'sha256'),'hex');
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now(),last_error=null where pipeline_id=i.pipeline_id and stage='DRAFTED';
 update public."21_content_pipeline_image" set status='PROCESSING',claimed_by=p_worker_key,claim_token=v_token,claimed_at=now(),
 claim_expires_at=now()+interval '20 minutes',attempt_count=attempt_count+1,generation_contract=v_contract,generation_contract_hash=v_hash,
 next_eligible_at=null,failure_stage=null,failure_code=null,last_error=null,updated_at=now()
 where pipeline_image_id=i.pipeline_image_id returning * into i;
 insert into public."23_content_pipeline_image_run"(pipeline_image_id,pipeline_id,claim_token,worker_key,attempt_no,status,metadata)
 values(i.pipeline_image_id,i.pipeline_id,v_token,p_worker_key,i.attempt_count,'RUNNING',
 jsonb_build_object('generationContractHash',v_hash,'generationContract',v_contract)) returning pipeline_image_run_id into v_run;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineImageRunId',v_run,'claimToken',v_token,
 'pipelineId',i.pipeline_id,'contentKey',p.content_key,'topicKey',p.topic_key,'imageId',i.image_id,'assetKey',i.asset_key,
 'ordinal',i.ordinal,'attemptNo',i.attempt_count,'generationContract',v_contract,'generationContractHash',v_hash);
end $$;

-- Repeated brief mismatch gets a cooldown; pending work remains eligible.
create or replace function public.content_pipeline_fail_image_v1(
 p_pipeline_image_id bigint,p_pipeline_image_run_id bigint,p_claim_token uuid,p_failure_status text,p_failure_stage text,
 p_failure_code text,p_error text,p_retry_action text default null,p_generation_status text default null,p_qa_status text default null,
 p_file_status text default null,p_upload_status text default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype; v_status text; v_mismatch int; v_next timestamptz;
begin
 if p_failure_status not in ('RETRY','HOLD','BLOCKED','FAILED') then raise exception using errcode='22023',message='CONTENT_PIPELINE_INVALID_IMAGE_FAILURE_STATUS'; end if;
 v_status:=case when p_failure_status='FAILED' then 'RETRY' else p_failure_status end;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 if not found then raise exception using errcode='P0002',message='CONTENT_PIPELINE_IMAGE_NOT_FOUND'; end if;
 if i.status<>'PROCESSING' or i.claim_token is distinct from p_claim_token then raise exception using errcode='40001',message='CONTENT_PIPELINE_IMAGE_CLAIM_CONFLICT'; end if;
 v_mismatch:=case when p_failure_code='BRIEF_MISMATCH' then i.brief_mismatch_count+1 else 0 end;
 v_next:=case when p_failure_code='BRIEF_MISMATCH' and v_mismatch>=2 then now()+interval '60 minutes' when v_status='RETRY' then now()+interval '5 minutes' else null end;
 update public."21_content_pipeline_image" set status=v_status,retry_action=p_retry_action,
 generation_status=coalesce(p_generation_status,generation_status),qa_status=coalesce(p_qa_status,qa_status),
 file_status=coalesce(p_file_status,file_status),upload_status=coalesce(p_upload_status,upload_status),
 brief_mismatch_count=v_mismatch,next_eligible_at=v_next,failure_stage=p_failure_stage,failure_code=p_failure_code,last_error=left(p_error,2000),
 claimed_by=null,claim_token=null,claimed_at=null,claim_expires_at=null,updated_at=now()
 where pipeline_image_id=p_pipeline_image_id returning * into i;
 update public."23_content_pipeline_image_run" set status=case when p_failure_status='FAILED' then 'FAILED' else p_failure_status end,
 completed_at=now(),failure_stage=p_failure_stage,failure_code=p_failure_code,error=left(p_error,2000),
 metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('briefMismatchCount',v_mismatch,'nextEligibleAt',v_next)
 where pipeline_image_run_id=p_pipeline_image_run_id and pipeline_image_id=p_pipeline_image_id and claim_token=p_claim_token and status='RUNNING';
 update public."18_content_pipeline" set stage='VISUAL',updated_at=now() where pipeline_id=i.pipeline_id and ownership_state='CLAIMED' and stage in ('DRAFTED','VISUAL');
 return jsonb_build_object('pipelineImageId',i.pipeline_image_id,'pipelineId',i.pipeline_id,'status',i.status,'retryAction',i.retry_action,
 'failureStage',i.failure_stage,'failureCode',i.failure_code,'briefMismatchCount',i.brief_mismatch_count,'nextEligibleAt',i.next_eligible_at);
end $$;

revoke all on function public.content_pipeline_build_image_generation_contract_v1(bigint) from public,anon,authenticated;
revoke all on function public.content_pipeline_claim_image_v1(text) from public,anon,authenticated;
revoke all on function public.content_pipeline_fail_image_v1(bigint,bigint,uuid,text,text,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.content_pipeline_build_image_generation_contract_v1(bigint) to service_role;
grant execute on function public.content_pipeline_claim_image_v1(text) to service_role;
grant execute on function public.content_pipeline_fail_image_v1(bigint,bigint,uuid,text,text,text,text,text,text,text,text,text,jsonb) to service_role;
