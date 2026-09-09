begin;

create or replace function public.content_factory_store_blocked_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  topic_row public."16_content_topic"%rowtype;
  new_content_id bigint;
  v_content_key text := p_payload #>> '{content,contentKey}';
  v_topic_key text := p_payload ->> 'topicKey';
  v_content_type text := p_payload #>> '{content,contentType}';
  source jsonb;
  relation jsonb;
  existing_key text;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'CONTENT_FACTORY_INVALID_PAYLOAD';
  end if;

  select * into topic_row
  from public."16_content_topic"
  where topic_key = v_topic_key
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'CONTENT_FACTORY_TOPIC_NOT_FOUND';
  end if;
  if topic_row.risk_level <> 'HIGH' or topic_row.status <> 'BLOCKED' then
    raise exception using errcode = '40001', message = 'CONTENT_FACTORY_TOPIC_NOT_BLOCKED_HIGH_RISK';
  end if;
  if topic_row.content_type <> v_content_type then
    raise exception using errcode = '22023', message = 'CONTENT_FACTORY_CONTENT_TYPE_MISMATCH';
  end if;
  if v_content_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or v_content_key <> v_topic_key then
    raise exception using errcode = '22023', message = 'CONTENT_FACTORY_INVALID_CONTENT_KEY';
  end if;

  if topic_row.content_id is not null then
    select content_key into existing_key from public."12_content" where content_id = topic_row.content_id;
    if existing_key = v_content_key then
      return jsonb_build_object('status', 'ALREADY_STORED', 'visibility', 'BLOCKED', 'contentId', topic_row.content_id, 'contentKey', v_content_key);
    end if;
    raise exception using errcode = '40001', message = 'CONTENT_FACTORY_TOPIC_CONTENT_CONFLICT';
  end if;

  for source in select value from jsonb_array_elements(coalesce(p_payload -> 'assetSources', '[]'::jsonb)) loop
    if source ->> 'rightsStatus' is null or source ->> 'rightsStatus' not in ('OWNED_APPROVED', 'LICENSED_APPROVED', 'PERMISSION_CONFIRMED', 'NOT_REQUIRED') then
      raise exception using errcode = '22023', message = 'CONTENT_FACTORY_UNAPPROVED_ASSET_SOURCE';
    end if;
    if source ->> 'storagePath' is not null and source ->> 'storagePath' !~ ('^contents/' || v_content_key || '/(thumbnail|hero|body-[0-9]{2})[.]webp$') then
      raise exception using errcode = '22023', message = 'CONTENT_FACTORY_INVALID_STORAGE_PATH';
    end if;
  end loop;

  insert into public."12_content" (
    content_key, title, summary, content_type, thumbnail_image_storage_path,
    hero_image_storage_path, body_blocks, is_active, published_at
  ) values (
    v_content_key, p_payload #>> '{content,title}', p_payload #>> '{content,summary}', v_content_type,
    p_payload #>> '{content,thumbnailImageStoragePath}', p_payload #>> '{content,heroImageStoragePath}',
    p_payload #> '{content,bodyBlocks}', false, null
  ) returning content_id into new_content_id;

  insert into public."13_content_bike_model" (content_id, bike_model_id)
  select new_content_id, value::bigint from jsonb_array_elements_text(coalesce(p_payload #> '{relations,bikeModelIds}', '[]'::jsonb));
  insert into public."14_content_bike_model_year" (content_id, bike_model_year_id)
  select new_content_id, value::bigint from jsonb_array_elements_text(coalesce(p_payload #> '{relations,bikeModelYearIds}', '[]'::jsonb));

  for relation in select value from jsonb_array_elements(coalesce(p_payload #> '{relations,parts}', '[]'::jsonb)) loop
    if relation ->> 'partType' is null or relation ->> 'partType' not in ('TIRE', 'BATTERY', 'BRAKE') or relation ->> 'scopeType' <> 'CATEGORY' then
      raise exception using errcode = '22023', message = 'CONTENT_FACTORY_INVALID_PART_RELATION';
    end if;
    insert into public."15_content_part_link" (content_id, part_type, scope_type, display_order, is_active)
    values (new_content_id, relation ->> 'partType', 'CATEGORY', (select count(*) from public."15_content_part_link" where content_id = new_content_id), false);
  end loop;

  for source in select value from jsonb_array_elements(coalesce(p_payload -> 'assetSources', '[]'::jsonb)) loop
    insert into public."17_content_asset_source" (
      content_id, content_key, asset_role, asset_key, storage_path, source_type,
      source_page_url, source_asset_url, source_owner, license_name, license_url,
      permission_contact, permission_note, rights_status, edited, edit_description,
      used_in_service, first_used_at, last_checked_at
    ) values (
      new_content_id, v_content_key, source ->> 'assetRole', source ->> 'assetKey', source ->> 'storagePath', source ->> 'sourceType',
      source ->> 'sourcePageUrl', source ->> 'sourceAssetUrl', source ->> 'sourceOwner', source ->> 'licenseName', source ->> 'licenseUrl',
      source ->> 'permissionContact', source ->> 'permissionNote', source ->> 'rightsStatus',
      coalesce((source ->> 'edited')::boolean, false), source ->> 'editDescription', false, null,
      (source ->> 'lastCheckedAt')::timestamptz
    );
  end loop;

  update public."16_content_topic"
  set content_id = new_content_id, last_error = coalesce(last_error, 'HIGH_RISK_REQUIRES_MANUAL_APPROVAL')
  where content_topic_id = topic_row.content_topic_id;

  return jsonb_build_object('status', 'DRAFT_STORED', 'visibility', 'BLOCKED', 'contentId', new_content_id, 'contentKey', v_content_key);
end;
$$;

revoke all on function public.content_factory_store_blocked_v1(jsonb) from public, anon, authenticated;
grant execute on function public.content_factory_store_blocked_v1(jsonb) to service_role;

commit;
