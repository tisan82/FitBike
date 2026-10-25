-- Design prototype only. Not a deployable migration or complete supply API.
-- Requires the verified existing 18/19/21 tables. No Storage writes/deletes.
create table public.content_pipeline_visual_supply (
 supply_id uuid primary key default gen_random_uuid(),
 pipeline_id bigint not null references public."18_content_pipeline"(pipeline_id),
 authoring_run_id bigint not null references public."19_content_pipeline_run"(pipeline_run_id),
 pipeline_image_id bigint references public."21_content_pipeline_image"(pipeline_image_id),
 image_id text not null check (length(btrim(image_id)) between 1 and 100),
 contract_hash text not null check (contract_hash ~ '^[a-f0-9]{64}$'),
 operation_id uuid not null,
 intent_hash text not null check (intent_hash ~ '^[a-f0-9]{64}$'),
 source_role text not null check (source_role in ('PRODUCTION_INPUT','REFERENCE_ONLY')),
 source_kind text not null check (source_kind in ('REAL_SOURCE','CHATGPT_NATIVE')),
 production_path text not null check (production_path in
   ('SERVER_TRANSFORM','STORED_NATIVE_OUTPUT','NATIVE_EDIT_REQUIRED','REFERENCE_ONLY')),
 lifecycle text not null default 'PREPARED' check (lifecycle in
   ('PREPARED','STORED','BOUND','FAILED','REJECTED','SUPERSEDED')),
 is_selected boolean not null default false,
 original_bucket text,
 original_path text,
 original_sha256 text check (original_sha256 ~ '^[a-f0-9]{64}$'),
 original_mime text check (original_mime in ('image/png','image/jpeg','image/webp')),
 original_bytes integer check (original_bytes between 12 and 8388608),
 original_width integer check (original_width > 0),
 original_height integer check (original_height > 0),
 source_page_url text,
 source_asset_url text,
 source_owner text,
 provenance jsonb not null default '{}' check (jsonb_typeof(provenance)='object'),
 native_evidence jsonb not null default '{}' check (jsonb_typeof(native_evidence)='object'),
 technical_verified_at timestamptz,
 source_inspected_at timestamptz,
 source_evidence text,
 bound_at timestamptz,
 last_error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(authoring_run_id,operation_id),
 constraint supply_role_path check (
   (source_role='REFERENCE_ONLY' and production_path='REFERENCE_ONLY' and not is_selected)
   or (source_role='PRODUCTION_INPUT' and production_path<>'REFERENCE_ONLY')),
 constraint supply_kind_path check (
   production_path<>'STORED_NATIVE_OUTPUT' or source_kind='CHATGPT_NATIVE'),
 constraint supply_real_source_provenance check (
   source_kind<>'REAL_SOURCE' or (
     source_page_url ~ '^https://' and source_asset_url ~ '^https://'
     and length(btrim(source_owner)) between 1 and 200) is true),
 constraint supply_verified_storage check (
   lifecycle not in ('STORED','BOUND') or (
     original_bucket='content-pipeline-native-handoff'
     and original_sha256 is not null and original_mime is not null
     and original_bytes is not null and original_width is not null and original_height is not null
     and original_width::bigint*original_height::bigint<=40000000
     and original_path='authoring-supply/'||pipeline_id||'/'||authoring_run_id||'/'||supply_id||'/'||
       original_sha256||case original_mime when 'image/png' then '.png' when 'image/jpeg' then '.jpg' else '.webp' end
     and technical_verified_at is not null and source_inspected_at is not null
     and length(btrim(source_evidence)) between 20 and 1000
     and (source_kind<>'CHATGPT_NATIVE' or native_evidence<>'{}'::jsonb)
   ) is true),
 constraint supply_bound_identity check (
   lifecycle<>'BOUND' or (pipeline_image_id is not null and bound_at is not null)),
 constraint supply_selected_bound check (
   not is_selected or (lifecycle='BOUND' and source_role='PRODUCTION_INPUT'))
);

create index supply_pipeline_image_lookup on public.content_pipeline_visual_supply
 (pipeline_id,image_id,contract_hash,lifecycle);
create index supply_bound_lookup on public.content_pipeline_visual_supply
 (pipeline_image_id,contract_hash) where lifecycle='BOUND';
create unique index supply_one_selected_input on public.content_pipeline_visual_supply
 (pipeline_image_id) where is_selected and lifecycle='BOUND';
alter table public.content_pipeline_visual_supply enable row level security;
revoke all on public.content_pipeline_visual_supply from public,anon,authenticated;
grant select,insert,update,delete on public.content_pipeline_visual_supply to service_role;

alter table public."21_content_pipeline_image" add column source_supply_policy text
 not null default 'LEGACY' check (source_supply_policy in ('LEGACY','INPUT_REQUIRED'));

-- Cross-record identity and persisted proof immutability. API run/session fencing
-- and legal lifecycle transitions still belong in the future authenticated RPCs.
create function public.content_pipeline_supply_identity_guard_v1()
 returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public."19_content_pipeline_run" r
   where r.pipeline_run_id=new.authoring_run_id and r.pipeline_id=new.pipeline_id
   and r.metadata->>'executionMode'='AUTHORING_V1') then
   raise exception 'SUPPLY_AUTHORING_RUN_MISMATCH';
 end if;
 -- A historical binding may be retired after the Task Contract changes.
 -- Do not strand its selected unique slot by requiring the old Hash to be current.
 if new.pipeline_image_id is not null and
   (tg_op='INSERT' or new.pipeline_image_id is distinct from old.pipeline_image_id
     or new.lifecycle='BOUND' or new.is_selected) and not exists(
   select 1 from public."21_content_pipeline_image" i
   where i.pipeline_image_id=new.pipeline_image_id and i.pipeline_id=new.pipeline_id
   and i.image_id=new.image_id and i.generation_contract_hash=new.contract_hash) then
   raise exception 'SUPPLY_TASK_CONTRACT_MISMATCH';
 end if;
 if tg_op='UPDATE' then
   if row(old.pipeline_id,old.authoring_run_id,old.image_id,old.contract_hash,
     old.operation_id,old.intent_hash,old.source_role,old.source_kind,old.production_path)
     is distinct from row(new.pipeline_id,new.authoring_run_id,new.image_id,new.contract_hash,
     new.operation_id,new.intent_hash,new.source_role,new.source_kind,new.production_path) then
     raise exception 'SUPPLY_INTENT_IMMUTABLE';
   end if;
   if old.technical_verified_at is not null and row(
     old.original_bucket,old.original_path,old.original_sha256,old.original_mime,
     old.original_bytes,old.original_width,old.original_height,old.technical_verified_at,
     old.source_inspected_at,old.source_evidence,old.source_page_url,old.source_asset_url,
     old.source_owner,old.provenance,old.native_evidence)
     is distinct from row(
     new.original_bucket,new.original_path,new.original_sha256,new.original_mime,
     new.original_bytes,new.original_width,new.original_height,new.technical_verified_at,
     new.source_inspected_at,new.source_evidence,new.source_page_url,new.source_asset_url,
     new.source_owner,new.provenance,new.native_evidence) then
     raise exception 'SUPPLY_PERSISTED_IDENTITY_IMMUTABLE';
   end if;
   if old.pipeline_image_id is not null and new.pipeline_image_id is distinct from old.pipeline_image_id then
     raise exception 'SUPPLY_BINDING_IMMUTABLE';
   end if;
 end if;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function public.content_pipeline_supply_identity_guard_v1() from public,anon,authenticated;
grant execute on function public.content_pipeline_supply_identity_guard_v1() to service_role;
create trigger supply_identity_guard before insert or update
 on public.content_pipeline_visual_supply for each row
 execute function public.content_pipeline_supply_identity_guard_v1();

-- DB eligibility component only, NOT a Claim API or physical Storage probe.
-- Future Queue/Claim must combine it with their existing phase/lease/contract gates.
create function public.content_pipeline_source_supply_ready_v1(p_image_id bigint)
 returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
   select 1 from public."21_content_pipeline_image" i
   join public.content_pipeline_visual_supply s on s.pipeline_image_id=i.pipeline_image_id
   and s.pipeline_id=i.pipeline_id and s.image_id=i.image_id
   and s.contract_hash=i.generation_contract_hash
   where i.pipeline_image_id=p_image_id and s.lifecycle='BOUND' and s.is_selected
   and s.source_role='PRODUCTION_INPUT'
   and s.production_path in ('SERVER_TRANSFORM','STORED_NATIVE_OUTPUT')
   and s.technical_verified_at is not null and s.source_inspected_at is not null
 );
$$;
revoke all on function public.content_pipeline_source_supply_ready_v1(bigint) from public,anon,authenticated;
grant execute on function public.content_pipeline_source_supply_ready_v1(bigint) to service_role;
