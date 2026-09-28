-- Require an uploaded object and a consumed ticket from the same image claim
-- before a Scheduled Image Task can become DONE.
create or replace function public.content_pipeline_image_done_storage_guard_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_content_key text; v_expected_path text;
begin
  if new.status <> 'DONE' or old.status = 'DONE' then return new; end if;

  select content_key into v_content_key
  from public."18_content_pipeline" where pipeline_id=new.pipeline_id;
  v_expected_path := 'contents/' || v_content_key || '/' || new.asset_key || '.webp';

  if new.storage_bucket is distinct from 'content-assets'
     or new.storage_path is distinct from v_expected_path
     or new.sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_INVALID_STORAGE_PROOF';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id='content-assets' and o.name=v_expected_path
      and o.metadata->>'mimetype'='image/webp'
      and (o.metadata->>'size')::bigint between 1 and 4194304
  ) then
    raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_STORAGE_OBJECT_MISSING';
  end if;

  if not exists (
    select 1 from public."20_content_pipeline_asset_upload_ticket" t
    where t.pipeline_id=new.pipeline_id and t.asset_key=new.asset_key
      and t.claim_token=old.claim_token and t.consumed_at is not null
  ) then
    raise exception using errcode='22023',message='CONTENT_PIPELINE_IMAGE_UPLOAD_TICKET_MISSING';
  end if;
  return new;
end $$;

drop trigger if exists trg_content_pipeline_image_done_storage_guard on public."21_content_pipeline_image";
create trigger trg_content_pipeline_image_done_storage_guard
before update of status on public."21_content_pipeline_image"
for each row execute function public.content_pipeline_image_done_storage_guard_v1();

revoke all on function public.content_pipeline_image_done_storage_guard_v1() from public,anon,authenticated;
