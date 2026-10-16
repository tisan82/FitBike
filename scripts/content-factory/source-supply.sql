-- Authoring Source supply V1. Service-only RPCs; no model generation and no QA bypass.
alter table public."21_content_pipeline_image" add column if not exists source_supply_policy text not null default 'LEGACY';
alter table public."21_content_pipeline_image" add constraint source_supply_policy_valid check(source_supply_policy in ('LEGACY','INPUT_REQUIRED'));
create table public.content_pipeline_visual_supply (
 supply_id uuid primary key default gen_random_uuid(),
 pipeline_id bigint not null references public."18_content_pipeline"(pipeline_id),
 pipeline_image_id bigint not null references public."21_content_pipeline_image"(pipeline_image_id),
 authoring_run_id bigint not null references public."19_content_pipeline_run"(pipeline_run_id),
 worker_key text not null check(length(btrim(worker_key)) between 1 and 100),
 operation_id uuid not null,
 contract_hash text not null check(contract_hash ~ '^[a-f0-9]{64}$'),
 source_role text not null check(source_role in ('PRODUCTION_INPUT','REFERENCE_ONLY')),
 status text not null default 'PREPARING' check(status in ('PREPARING','READY','REJECTED')),
 selected boolean not null default false,
 intent jsonb not null check(jsonb_typeof(intent)='object'),
 proof jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(worker_key,operation_id),
 check(not selected or (status='READY' and source_role='PRODUCTION_INPUT')),
 check(status<>'READY' or proof is not null)
);
create unique index source_supply_one_selected on public.content_pipeline_visual_supply(pipeline_image_id) where selected;
create index source_supply_run on public.content_pipeline_visual_supply(authoring_run_id);
create index source_supply_current_identity on public.content_pipeline_visual_supply(pipeline_image_id,contract_hash,status);
create index source_supply_pipeline on public.content_pipeline_visual_supply(pipeline_id,pipeline_image_id,created_at);
alter table public.content_pipeline_visual_supply enable row level security;
revoke all on public.content_pipeline_visual_supply from public,anon,authenticated;
grant all on public.content_pipeline_visual_supply to service_role;

create function public.content_pipeline_supply_json_v1(s public.content_pipeline_visual_supply) returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('supplyId',s.supply_id,'pipelineId',s.pipeline_id,'pipelineImageId',s.pipeline_image_id,'authoringRunId',s.authoring_run_id,'operationId',s.operation_id,'contractHash',s.contract_hash,'sourceRole',s.source_role,'status',s.status,'selected',s.selected,'intent',s.intent,'proof',s.proof,'originalSha',s.proof->>'sha256','sourceOwner',s.intent->>'sourceOwner','uploadPrefix','authoring-supply/'||s.pipeline_id||'/'||s.pipeline_image_id||'/'||s.supply_id||'/');$$;

create function public.content_pipeline_claim_authoring_supply_v1(p_worker_key text,p_request_id uuid,p_pipeline_id bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;r public."19_content_pipeline_run"%rowtype;
begin
 if length(btrim(coalesce(p_worker_key,''))) not between 1 and 100 then raise exception 'SUPPLY_WORKER_INVALID';end if;
 v:=public.content_pipeline_claim_authoring_v1(p_request_id,p_pipeline_id);
 if v->>'pipelineRunId' is null then return v;end if;
 select * into r from public."19_content_pipeline_run" where pipeline_run_id=(v->>'pipelineRunId')::bigint for update;
 if r.metadata->>'sourceSupplyWorkerKey' is not null and r.metadata->>'sourceSupplyWorkerKey'<>p_worker_key then raise exception 'SUPPLY_OWNER_MISMATCH';end if;
 update public."19_content_pipeline_run" set metadata=metadata||jsonb_build_object('sourceSupplyWorkerKey',p_worker_key,'sourceSupplyVersion',1) where pipeline_run_id=r.pipeline_run_id;
 return v||jsonb_build_object('sourceSupplyVersion',1);
end $$;

create function public.content_pipeline_source_supply_status_v1(p_worker_key text,p_pipeline_id bigint default null,p_pipeline_image_id bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb;m jsonb;
begin
 if length(btrim(coalesce(p_worker_key,''))) not between 1 and 100 or (p_pipeline_id is null and p_pipeline_image_id is null) then raise exception 'SUPPLY_TARGET_REQUIRED';end if;
 select coalesce(jsonb_agg(public.content_pipeline_supply_json_v1(s) order by s.created_at,s.supply_id),'[]'::jsonb) into v from public.content_pipeline_visual_supply s where (p_pipeline_id is null or s.pipeline_id=p_pipeline_id) and (p_pipeline_image_id is null or s.pipeline_image_id=p_pipeline_image_id);
 select coalesce(jsonb_agg(i.pipeline_image_id order by i.ordinal,i.pipeline_image_id),'[]'::jsonb) into m from public."21_content_pipeline_image" i where (p_pipeline_id is null or i.pipeline_id=p_pipeline_id) and (p_pipeline_image_id is null or i.pipeline_image_id=p_pipeline_image_id) and i.source_supply_policy='INPUT_REQUIRED' and i.status not in ('DONE','CANCELLED') and not exists(select 1 from public.content_pipeline_visual_supply s where s.pipeline_image_id=i.pipeline_image_id and s.contract_hash=i.generation_contract_hash and s.selected and s.status='READY');
 return jsonb_build_object('items',v,'supplies',v,'imageTasks',coalesce((select jsonb_agg(jsonb_build_object('pipelineImageId',ii.pipeline_image_id,'imageId',ii.image_id,'contractHash',ii.generation_contract_hash,'generationContract',ii.generation_contract,'sourceSupplyPolicy',ii.source_supply_policy) order by ii.ordinal) from public."21_content_pipeline_image" ii where (p_pipeline_id is null or ii.pipeline_id=p_pipeline_id) and (p_pipeline_image_id is null or ii.pipeline_image_id=p_pipeline_image_id)),'[]'::jsonb),'missingImageIds',m,'supplyReady',jsonb_array_length(m)=0);
end $$;

create function public.content_pipeline_complete_authoring_supply_v1(p_worker_key text,p_pipeline_id bigint,p_pipeline_run_id bigint,p_package jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public."19_content_pipeline_run"%rowtype;v jsonb;was_complete boolean;
begin
 perform 1 from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 select * into r from public."19_content_pipeline_run" where pipeline_run_id=p_pipeline_run_id and pipeline_id=p_pipeline_id for update;
 if not found or r.metadata->>'sourceSupplyWorkerKey' is distinct from p_worker_key or p_worker_key is null then raise exception 'SUPPLY_OWNER_MISMATCH';end if;
 was_complete:=coalesce((r.metadata->>'sourceSupplyCompleted')::boolean,false);
 v:=public.content_pipeline_complete_authoring_v1(p_pipeline_id,p_pipeline_run_id,p_package);
 if not was_complete then
  update public."21_content_pipeline_image" set source_supply_policy='INPUT_REQUIRED' where pipeline_id=p_pipeline_id and status in ('PENDING','RETRY') and claim_token is null;
  update public."19_content_pipeline_run" set metadata=metadata||jsonb_build_object('sourceSupplyCompleted',true) where pipeline_run_id=p_pipeline_run_id;
 end if;
 return v||jsonb_build_object('pipelineRunId',p_pipeline_run_id)||public.content_pipeline_source_supply_status_v1(p_worker_key,p_pipeline_id,null);
end $$;

-- Resume supply only. It never rewrites an existing writer artifact or Contract.
create function public.content_pipeline_open_source_supply_v1(p_worker_key text,p_pipeline_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public."18_content_pipeline"%rowtype;r public."19_content_pipeline_run"%rowtype;
begin
 if length(btrim(coalesce(p_worker_key,''))) not between 1 and 100 then raise exception 'SUPPLY_WORKER_INVALID';end if;
 select * into p from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 if not found or p.stage not in ('DRAFTED','VISUAL') or p.ownership_state<>'CLAIMED' then raise exception 'SUPPLY_PIPELINE_NOT_OPEN';end if;
 if exists(select 1 from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id and status='RUNNING') then raise exception 'SUPPLY_AUTHORING_BUSY';end if;
 select * into r from public."19_content_pipeline_run" where pipeline_id=p_pipeline_id and metadata->>'sourceSupplyResume'='true' and metadata->>'sourceSupplyWorkerKey'=p_worker_key and not exists(select 1 from public."19_content_pipeline_run" newer where newer.pipeline_id=p_pipeline_id and newer.pipeline_run_id>"19_content_pipeline_run".pipeline_run_id and newer.metadata ? 'sourceSupplyWorkerKey') order by pipeline_run_id desc limit 1;
 if not found then
  insert into public."19_content_pipeline_run"(pipeline_id,stage,status,completed_at,metadata) values(p_pipeline_id,'WRITING','PASS',now(),jsonb_build_object('sourceSupplyResume',true,'sourceSupplyWorkerKey',p_worker_key,'sourceSupplyVersion',1)) returning * into r;
 end if;
 update public."21_content_pipeline_image" set source_supply_policy='INPUT_REQUIRED' where pipeline_id=p_pipeline_id and status in ('PENDING','RETRY') and claim_token is null;
 return jsonb_build_object('pipelineId',p_pipeline_id,'pipelineRunId',r.pipeline_run_id,'stage',p.stage,'writerArtifact',p.writer_artifact)||public.content_pipeline_source_supply_status_v1(p_worker_key,p_pipeline_id,null);
end $$;

create function public.content_pipeline_prepare_source_supply_v1(p_worker_key text,p_pipeline_run_id bigint,p_pipeline_image_id bigint,p_operation_id uuid,p_intent jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public."21_content_pipeline_image"%rowtype;p public."18_content_pipeline"%rowtype;r public."19_content_pipeline_run"%rowtype;s public.content_pipeline_visual_supply%rowtype;
begin
 if p_operation_id is null or jsonb_typeof(p_intent) is distinct from 'object' or length(btrim(coalesce(p_worker_key,''))) not between 1 and 100 then raise exception 'SUPPLY_INTENT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('supply:'||p_worker_key||':'||p_operation_id,0));
 select * into s from public.content_pipeline_visual_supply where worker_key=p_worker_key and operation_id=p_operation_id;
 if found then
  if s.authoring_run_id<>p_pipeline_run_id or s.pipeline_image_id<>p_pipeline_image_id or s.intent<>p_intent then raise exception 'SUPPLY_REPLAY_CONFLICT';end if;
  return public.content_pipeline_supply_json_v1(s)||jsonb_build_object('replayed',true);
 end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=p_pipeline_image_id for update;
 select * into p from public."18_content_pipeline" where pipeline_id=i.pipeline_id;
 select * into r from public."19_content_pipeline_run" where pipeline_run_id=p_pipeline_run_id and pipeline_id=i.pipeline_id;
 if r.pipeline_run_id is null or r.status is distinct from 'PASS' or r.metadata->>'sourceSupplyWorkerKey' is distinct from p_worker_key or exists(select 1 from public."19_content_pipeline_run" newer where newer.pipeline_id=i.pipeline_id and newer.pipeline_run_id>r.pipeline_run_id and newer.metadata ? 'sourceSupplyWorkerKey') then raise exception 'SUPPLY_OWNER_MISMATCH';end if;
 if p.stage not in ('DRAFTED','VISUAL') or p.ownership_state<>'CLAIMED' or i.status not in ('PENDING','RETRY') or (i.claim_token is not null and i.claim_expires_at>now()) then raise exception 'SUPPLY_TARGET_NOT_OPEN';end if;
 if p_intent->>'contractHash' is distinct from i.generation_contract_hash then raise exception 'SUPPLY_CONTRACT_MISMATCH';end if;
 if p_intent->>'sourceRole' not in ('PRODUCTION_INPUT','REFERENCE_ONLY') or p_intent->>'sourceRole' is null or p_intent->>'sourceKind' is distinct from 'REAL_SOURCE' or coalesce(p_intent->>'sourceAssetUrl','') !~ '^https://' or coalesce(p_intent->>'sourcePageUrl','') !~ '^https://' or coalesce(length(btrim(p_intent->>'sourceOwner')),0) not between 1 and 200 or jsonb_typeof(p_intent->'sourceObservation') is distinct from 'object' or p_intent->'sourceObservation'->>'pixelsInspected' is distinct from 'true' or coalesce(length(btrim(p_intent->'sourceObservation'->>'evidence')),0) not between 20 and 2000 or coalesce(p_intent->'sourceObservation'->>'expectedSha','') !~ '^[a-f0-9]{64}$' then raise exception 'SUPPLY_SOURCE_PROVENANCE_REQUIRED';end if;
 if p_intent->>'sourceRole'='PRODUCTION_INPUT' and (p_intent->>'nativeEditRequired')::boolean is distinct from false then raise exception 'SUPPLY_NATIVE_EDIT_UNSUPPORTED';end if;
 insert into public.content_pipeline_visual_supply(pipeline_id,pipeline_image_id,authoring_run_id,worker_key,operation_id,contract_hash,source_role,intent) values(i.pipeline_id,i.pipeline_image_id,p_pipeline_run_id,p_worker_key,p_operation_id,i.generation_contract_hash,p_intent->>'sourceRole',p_intent) returning * into s;
 update public."21_content_pipeline_image" set source_supply_policy='INPUT_REQUIRED' where pipeline_image_id=i.pipeline_image_id;
 return public.content_pipeline_supply_json_v1(s)||jsonb_build_object('replayed',false);
end $$;

create function public.content_pipeline_finish_source_supply_v1(p_worker_key text,p_supply_id uuid,p_proof jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.content_pipeline_visual_supply%rowtype;i public."21_content_pipeline_image"%rowtype;v_path text;
begin
 select * into s from public.content_pipeline_visual_supply where supply_id=p_supply_id;
 if not found or s.worker_key is distinct from p_worker_key then raise exception 'SUPPLY_OWNER_MISMATCH';end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=s.pipeline_image_id for update;
 select * into s from public.content_pipeline_visual_supply where supply_id=p_supply_id for update;
 if s.status='READY' then
  if s.proof is distinct from p_proof then raise exception 'SUPPLY_PROOF_REPLAY_CONFLICT';end if;
  return public.content_pipeline_supply_json_v1(s)||jsonb_build_object('replayed',true);
 end if;
 if s.status<>'PREPARING' or not exists(select 1 from public."19_content_pipeline_run" owner_run where owner_run.pipeline_run_id=s.authoring_run_id and owner_run.pipeline_id=s.pipeline_id and owner_run.status='PASS' and owner_run.metadata->>'sourceSupplyWorkerKey'=p_worker_key) or exists(select 1 from public."19_content_pipeline_run" newer where newer.pipeline_id=s.pipeline_id and newer.pipeline_run_id>s.authoring_run_id and newer.metadata ? 'sourceSupplyWorkerKey') or i.generation_contract_hash<>s.contract_hash or i.status not in ('PENDING','RETRY') or (i.claim_token is not null and i.claim_expires_at>now()) or not exists(select 1 from public."18_content_pipeline" where pipeline_id=i.pipeline_id and stage in ('DRAFTED','VISUAL') and ownership_state='CLAIMED') then raise exception 'SUPPLY_TARGET_NOT_OPEN';end if;
 v_path:='authoring-supply/'||s.pipeline_id||'/'||s.pipeline_image_id||'/'||s.supply_id||'/'||(p_proof->>'sha256')||case p_proof->>'mimeType' when 'image/png' then '.png' when 'image/jpeg' then '.jpg' when 'image/webp' then '.webp' else '.invalid' end;
 if jsonb_typeof(p_proof) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_proof) k where k not in ('storageBucket','storagePath','sha256','mimeType','byteSize','width','height','decodeVerified','signatureVerified')) or p_proof->>'storageBucket' is distinct from 'content-pipeline-native-handoff' or p_proof->>'storagePath' is distinct from v_path or p_proof->>'sha256' !~ '^[a-f0-9]{64}$' or p_proof->>'sha256' is distinct from s.intent->'sourceObservation'->>'expectedSha' or p_proof->>'sha256' is null or coalesce(p_proof->>'mimeType','') not in ('image/png','image/jpeg','image/webp') or coalesce((p_proof->>'byteSize')::bigint,0) not between 12 and 8388608 or coalesce((p_proof->>'width')::bigint,0)<1 or coalesce((p_proof->>'height')::bigint,0)<1 or (p_proof->>'width')::bigint*(p_proof->>'height')::bigint>40000000 or p_proof->>'decodeVerified' is distinct from 'true' or p_proof->>'signatureVerified' is distinct from 'true' then raise exception 'SUPPLY_STORAGE_PROOF_INVALID';end if;
 if s.source_role='PRODUCTION_INPUT' then update public.content_pipeline_visual_supply set selected=false,updated_at=now() where pipeline_image_id=s.pipeline_image_id and selected;end if;
 update public.content_pipeline_visual_supply set proof=p_proof,status='READY',selected=source_role='PRODUCTION_INPUT',updated_at=now() where supply_id=p_supply_id returning * into s;
 return public.content_pipeline_supply_json_v1(s)||jsonb_build_object('replayed',false);
end $$;

create function public.content_pipeline_dispatch_supplied_source_v1(p_worker_key text,p_request_id uuid,p_operation_id uuid,p_supply_id uuid,p_transform jsonb default '{}'::jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.content_pipeline_visual_supply%rowtype;c jsonb;i public."21_content_pipeline_image"%rowtype;v jsonb;
begin
 select * into s from public.content_pipeline_visual_supply where supply_id=p_supply_id;
 if not found then raise exception 'SUPPLY_NOT_FOUND';end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=s.pipeline_image_id for update;
 select * into s from public.content_pipeline_visual_supply where supply_id=p_supply_id for share;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' or c->>'handoffPhase' is distinct from 'PRODUCING' or (c->'claim'->>'pipelineImageId')::bigint is distinct from s.pipeline_image_id or c->'claim'->>'generationContractHash' is distinct from s.contract_hash then raise exception 'SUPPLY_ACTIVE_CLAIM_REQUIRED';end if;
 if s.status<>'READY' or not s.selected or s.source_role<>'PRODUCTION_INPUT' or s.contract_hash<>i.generation_contract_hash then raise exception 'SUPPLY_NOT_READY';end if;
 if jsonb_typeof(p_transform) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_transform) k where k not in ('maxWidth','crop','annotations')) then raise exception 'SUPPLY_TRANSFORM_INVALID';end if;
 v:=jsonb_build_object('preflightOnly',true,'sourceSupplyId',s.supply_id,'sourceAssetUrl',s.intent->>'sourceAssetUrl','sourcePageUrl',s.intent->>'sourcePageUrl','sourceOwner',s.intent->>'sourceOwner','transform',p_transform);
 return public.content_pipeline_dispatch_visual_source_request_v1(p_worker_key,p_request_id,p_operation_id,v);
end $$;

-- The predicate is shared by queue and Claim; ordinary legacy Tasks keep existing behavior.
create function public.content_pipeline_source_supply_eligible_v1(p_worker_key text,p_pipeline_image_id bigint) returns boolean language sql stable security definer set search_path='' as $$
 select i.source_supply_policy='LEGACY'
 or exists(select 1 from public.content_pipeline_visual_supply s where s.pipeline_image_id=i.pipeline_image_id and s.contract_hash=i.generation_contract_hash and s.status='READY' and s.selected and s.source_role='PRODUCTION_INPUT')
 or public.content_pipeline_owned_visual_candidate_v1(p_worker_key,i.pipeline_image_id) is not null
 or public.content_pipeline_owned_visual_recovery_v1(p_worker_key,i.pipeline_image_id) is not null
 or public.content_pipeline_owned_native_input_v1(p_worker_key,i.pipeline_image_id) is not null
 from public."21_content_pipeline_image" i where i.pipeline_image_id=p_pipeline_image_id;
$$;

do $patch$
declare def text;needle text:='and i0.status in (''PENDING'',''RETRY'',''PROCESSING'') and i0.staging_asset is null';
begin
 def:=pg_get_functiondef('public.content_pipeline_claim_visual_producer_v1(text,bigint)'::regprocedure);
 if strpos(def,needle)=0 then raise exception 'SOURCE_SUPPLY_CLAIM_BASELINE_DRIFT';end if;
 def:=replace(def,needle,needle||E'\n   and public.content_pipeline_source_supply_eligible_v1(p_worker_key,i0.pipeline_image_id)');
 execute def;
end $patch$;

create function public.content_pipeline_source_supply_queue_v1(p_worker_key text,p_pipeline_id bigint default null,p_execution_role text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare images jsonb;
begin
 if length(btrim(coalesce(p_worker_key,''))) not between 1 and 100 or (p_execution_role is not null and p_execution_role not in ('PRODUCER','REVIEWER')) then raise exception 'SUPPLY_QUEUE_ROLE_INVALID';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.pipeline_id,q.ordinal),'[]'::jsonb) into images from (
 select i.pipeline_image_id,i.pipeline_id,i.image_id,i.asset_key,i.ordinal,i.status,i.handoff_phase,i.visual_phase,i.claimed_by,i.claim_expires_at,i.next_eligible_at,i.failure_stage,i.failure_code,i.source_supply_policy,
 public.content_pipeline_source_supply_eligible_v1(p_worker_key,i.pipeline_image_id) as source_ready
 from public."21_content_pipeline_image" i where i.status in ('PENDING','RETRY','PROCESSING','READY_FOR_UPLOAD') and (p_pipeline_id is null or i.pipeline_id=p_pipeline_id)
 and (p_execution_role is distinct from 'PRODUCER' or (coalesce(i.visual_phase,'PRODUCTION_PENDING')<>'QA_PENDING' and i.status<>'READY_FOR_UPLOAD' and public.content_pipeline_source_supply_eligible_v1(p_worker_key,i.pipeline_image_id)))
 and (p_execution_role is distinct from 'REVIEWER' or i.visual_phase='QA_PENDING') order by i.pipeline_id,i.ordinal limit 25) q;
 return jsonb_build_object('images',images,'limit',25,'workerKey',p_worker_key);
end $$;

-- A semantic/source rejection invalidates only the supplied input of the latest current-Contract job.
create function public.content_pipeline_reject_supplied_input_v1() returns trigger language plpgsql security definer set search_path='' as $$
declare source_id text;
begin
 if new.status='RETRY' and (new.retry_action='SELECT_NEW_SOURCE' or new.failure_code in ('SEMANTIC_QA','MUST_SHOW_MISMATCH','DUPLICATE_SOURCE','DUPLICATE_SOURCE_SHA','DUPLICATE_SOURCE_CANONICAL_SHA'))
 and (old.status is distinct from new.status or old.failure_code is distinct from new.failure_code or old.retry_action is distinct from new.retry_action) then
 select j.spec->>'sourceSupplyId' into source_id from public."27_content_pipeline_source_stage_job" j where j.pipeline_image_id=new.pipeline_image_id and j.contract_hash=new.generation_contract_hash order by j.created_at desc,j.job_id desc limit 1;
 update public.content_pipeline_visual_supply set status='REJECTED',selected=false,updated_at=now() where supply_id::text=source_id and pipeline_image_id=new.pipeline_image_id and contract_hash=new.generation_contract_hash and selected;
 end if;
 return new;
end $$;
create trigger content_pipeline_reject_supplied_input after update of status,failure_code,retry_action on public."21_content_pipeline_image" for each row execute function public.content_pipeline_reject_supplied_input_v1();

-- Close an owned writing run without leaving an unresumable authoring lease.
create function public.content_pipeline_fail_authoring_supply_v1(p_worker_key text,p_pipeline_id bigint,p_pipeline_run_id bigint,p_failure_status text,p_error text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public."19_content_pipeline_run"%rowtype;v jsonb;
begin
 if p_failure_status is null or p_failure_status not in ('HOLD','BLOCKED') or coalesce(length(btrim(p_error)),0) not between 1 and 2000 then raise exception 'SUPPLY_AUTHORING_FAILURE_INVALID';end if;
 perform 1 from public."18_content_pipeline" where pipeline_id=p_pipeline_id for update;
 select * into r from public."19_content_pipeline_run" where pipeline_run_id=p_pipeline_run_id and pipeline_id=p_pipeline_id for update;
 if not found or r.metadata->>'sourceSupplyWorkerKey' is distinct from p_worker_key or p_worker_key is null then raise exception 'SUPPLY_OWNER_MISMATCH';end if;
 if r.status in ('HOLD','BLOCKED') and r.metadata->>'sourceSupplyFailureStatus' is not null then
  if r.metadata->>'sourceSupplyFailureStatus' is distinct from p_failure_status or r.error is distinct from p_error then raise exception 'SUPPLY_FAILURE_REPLAY_CONFLICT';end if;
  return jsonb_build_object('pipelineId',p_pipeline_id,'pipelineRunId',p_pipeline_run_id,'stage',r.status,'activeExecution',false,'replayed',true);
 end if;
 if r.status<>'RUNNING' or r.stage<>'WRITING' then raise exception 'SUPPLY_AUTHORING_RUN_INACTIVE';end if;
 v:=public.content_pipeline_fail_stage_v1(p_pipeline_id,p_pipeline_run_id,'WRITING',p_failure_status,p_error);
 update public."19_content_pipeline_run" set metadata=metadata||jsonb_build_object('sourceSupplyFailureStatus',p_failure_status) where pipeline_run_id=p_pipeline_run_id;
 return coalesce(v,'{}'::jsonb)||jsonb_build_object('pipelineId',p_pipeline_id,'pipelineRunId',p_pipeline_run_id,'stage',p_failure_status,'activeExecution',false,'replayed',false);
end $$;

-- Preflight duplicate detection can precede source-stage Job creation.
create function public.content_pipeline_reject_source_supply_v1(p_worker_key text,p_request_id uuid,p_supply_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.content_pipeline_visual_supply%rowtype;c jsonb;i public."21_content_pipeline_image"%rowtype;
begin
 if p_reason is distinct from 'DUPLICATE_SOURCE_PREFLIGHT' then raise exception 'SUPPLY_REJECTION_REASON_INVALID';end if;
 select * into s from public.content_pipeline_visual_supply where supply_id=p_supply_id;
 if not found then raise exception 'SUPPLY_NOT_FOUND';end if;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=s.pipeline_image_id for update;
 c:=public.content_pipeline_visual_claim_request_status_v1(p_worker_key,p_request_id);
 if c->>'activeClaim' is distinct from 'true' or c->>'handoffPhase' is distinct from 'PRODUCING' or c->'claim'->>'executionRole' is distinct from 'PRODUCER' or (c->'claim'->>'pipelineImageId')::bigint is distinct from s.pipeline_image_id or c->'claim'->>'generationContractHash' is distinct from s.contract_hash or i.generation_contract_hash is distinct from s.contract_hash then raise exception 'SUPPLY_ACTIVE_CLAIM_REQUIRED';end if;
 update public.content_pipeline_visual_supply set status='REJECTED',selected=false,updated_at=now() where supply_id=p_supply_id and source_role='PRODUCTION_INPUT' and status in ('READY','REJECTED');
 if not found then raise exception 'SUPPLY_NOT_READY';end if;
 return jsonb_build_object('supplyId',p_supply_id,'invalidated',true,'reason',p_reason);
end $$;

-- Permanent stored-byte failures invalidate inputs. Transient Storage outages preserve them.
create function public.content_pipeline_reject_corrupt_supply_job_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='FAILED' and new.failure_code in ('SOURCE_SUPPLY_ASSET_MISSING','SOURCE_SUPPLY_IDENTITY_MISMATCH') then
 update public.content_pipeline_visual_supply s set status='REJECTED',selected=false,updated_at=now()
 where s.supply_id::text=new.spec->>'sourceSupplyId' and s.pipeline_image_id=new.pipeline_image_id and s.contract_hash=new.contract_hash and s.status='READY' and s.selected
 and exists(select 1 from public."21_content_pipeline_image" i where i.pipeline_image_id=s.pipeline_image_id and i.generation_contract_hash=s.contract_hash);
 end if;
 return new;
end $$;
create trigger content_pipeline_reject_corrupt_supply_job after insert or update of status,failure_code on public."27_content_pipeline_source_stage_job" for each row execute function public.content_pipeline_reject_corrupt_supply_job_v1();

do $permissions$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('content_pipeline_supply_json_v1','content_pipeline_claim_authoring_supply_v1','content_pipeline_complete_authoring_supply_v1','content_pipeline_open_source_supply_v1','content_pipeline_prepare_source_supply_v1','content_pipeline_finish_source_supply_v1','content_pipeline_source_supply_status_v1','content_pipeline_dispatch_supplied_source_v1','content_pipeline_source_supply_eligible_v1','content_pipeline_source_supply_queue_v1','content_pipeline_reject_supplied_input_v1','content_pipeline_fail_authoring_supply_v1','content_pipeline_reject_source_supply_v1','content_pipeline_reject_corrupt_supply_job_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $permissions$;
