begin; -- Applied to production as migration 20260905121603.

create or replace function public.content_factory_next_topic_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select to_jsonb(topic)
  from (
    select
      t.content_topic_id,
      t.topic_key,
      t.topic,
      t.content_type,
      t.part_type,
      t.bike_model_id,
      t.normalized_subject,
      t.normalized_action,
      t.normalized_scope,
      t.priority,
      t.automation_level,
      t.risk_level,
      t.attempt_count,
      t.customer_question,
      t.primary_answer,
      t.required_coverage,
      t.excluded_claims,
      t.target_reader,
      t.content_goal
    from public."16_content_topic" t
    where t.status = 'PLANNED'
    order by t.priority, t.created_at, t.content_topic_id
    limit 1
  ) topic;
$$;

create or replace function public.content_factory_update_topic_v1(
  p_topic_key text,
  p_expected_status text,
  p_next_status text,
  p_last_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_topic public."16_content_topic"%rowtype;
begin
  if not (
    (p_expected_status = 'PLANNED' and p_next_status = any (array['GENERATING', 'BLOCKED', 'DUPLICATE', 'ARCHIVED']))
    or (p_expected_status = 'GENERATING' and p_next_status = any (array['REVIEW_REQUIRED', 'APPROVED', 'BLOCKED']))
    or (p_expected_status = 'REVIEW_REQUIRED' and p_next_status = any (array['APPROVED', 'BLOCKED', 'ARCHIVED']))
    or (p_expected_status = 'APPROVED' and p_next_status = any (array['BLOCKED', 'ARCHIVED']))
    or (p_expected_status = 'BLOCKED' and p_next_status = any (array['GENERATING', 'ARCHIVED']))
  ) then
    raise exception using errcode = '22023', message = 'CONTENT_FACTORY_INVALID_TOPIC_TRANSITION';
  end if;

  update public."16_content_topic"
  set
    status = p_next_status,
    last_error = case when p_next_status = 'BLOCKED' then left(p_last_error, 1000) else null end,
    attempt_count = case when p_expected_status = 'BLOCKED' and p_next_status = 'GENERATING' then attempt_count + 1 else attempt_count end
  where topic_key = p_topic_key
    and status = p_expected_status
    and content_id is null
  returning * into updated_topic;

  if not found then
    raise exception using errcode = '40001', message = 'CONTENT_FACTORY_TOPIC_STATE_CONFLICT';
  end if;

  return jsonb_build_object(
    'topicKey', updated_topic.topic_key,
    'status', updated_topic.status,
    'attemptCount', updated_topic.attempt_count
  );
end;
$$;

create or replace function public.content_factory_publish_v1(p_payload jsonb)
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
  v_published_at timestamptz;
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

  if topic_row.status = 'PUBLISHED' and topic_row.content_id is not null then
    select c.content_key into existing_key from public."12_content" c where c.content_id = topic_row.content_id;
    if existing_key = v_content_key then
      return jsonb_build_object('status', 'ALREADY_PUBLISHED', 'contentId', topic_row.content_id, 'contentKey', v_content_key);
    end if;
  end if;

  if topic_row.status <> 'APPROVED' or topic_row.content_id is not null then
    raise exception using errcode = '40001', message = 'CONTENT_FACTORY_TOPIC_NOT_APPROVED';
  end if;
  if topic_row.content_type <> v_content_type then
    raise exception using errcode = '22023', message = 'CONTENT_FACTORY_CONTENT_TYPE_MISMATCH';
  end if;
  if v_content_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'CONTENT_FACTORY_INVALID_CONTENT_KEY';
  end if;

  v_published_at := (p_payload #>> '{content,publishedAt}')::timestamptz;
  if v_published_at > now() + interval '1 minute' then
    raise exception using errcode = '22023', message = 'CONTENT_FACTORY_FUTURE_PUBLICATION';
  end if;

  for source in select value from jsonb_array_elements(coalesce(p_payload -> 'assetSources', '[]'::jsonb)) loop
    if source ->> 'rightsStatus' is null
       or source ->> 'rightsStatus' not in ('OWNED_APPROVED', 'LICENSED_APPROVED', 'PERMISSION_CONFIRMED', 'NOT_REQUIRED') then
      raise exception using errcode = '22023', message = 'CONTENT_FACTORY_UNAPPROVED_ASSET_SOURCE';
    end if;
    if source ->> 'storagePath' is not null
       and source ->> 'storagePath' !~ ('^contents/' || v_content_key || '/(thumbnail|hero|body-[0-9]{2})[.]webp$') then
      raise exception using errcode = '22023', message = 'CONTENT_FACTORY_INVALID_STORAGE_PATH';
    end if;
  end loop;

  insert into public."12_content" (
    content_key, title, summary, content_type, thumbnail_image_storage_path,
    hero_image_storage_path, body_blocks, is_active, published_at
  ) values (
    v_content_key,
    p_payload #>> '{content,title}',
    p_payload #>> '{content,summary}',
    v_content_type,
    p_payload #>> '{content,thumbnailImageStoragePath}',
    p_payload #>> '{content,heroImageStoragePath}',
    p_payload #> '{content,bodyBlocks}',
    true,
    v_published_at
  ) returning content_id into new_content_id;

  insert into public."13_content_bike_model" (content_id, bike_model_id)
  select new_content_id, value::bigint
  from jsonb_array_elements_text(coalesce(p_payload #> '{relations,bikeModelIds}', '[]'::jsonb));

  insert into public."14_content_bike_model_year" (content_id, bike_model_year_id)
  select new_content_id, value::bigint
  from jsonb_array_elements_text(coalesce(p_payload #> '{relations,bikeModelYearIds}', '[]'::jsonb));

  for relation in select value from jsonb_array_elements(coalesce(p_payload #> '{relations,parts}', '[]'::jsonb)) loop
    if relation ->> 'partType' is null
       or relation ->> 'partType' not in ('TIRE', 'BATTERY', 'BRAKE')
       or relation ->> 'scopeType' is null
       or relation ->> 'scopeType' <> 'CATEGORY' then
      raise exception using errcode = '22023', message = 'CONTENT_FACTORY_INVALID_PART_RELATION';
    end if;
    insert into public."15_content_part_link" (content_id, part_type, scope_type, display_order, is_active)
    values (new_content_id, relation ->> 'partType', 'CATEGORY',
      (select count(*) from public."15_content_part_link" where content_id = new_content_id), true);
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
      coalesce((source ->> 'edited')::boolean, false), source ->> 'editDescription',
      coalesce((source ->> 'usedInService')::boolean, true),
      case when coalesce((source ->> 'usedInService')::boolean, true) then now() else null end,
      (source ->> 'lastCheckedAt')::timestamptz
    );
  end loop;

  update public."16_content_topic"
  set status = 'PUBLISHED', content_id = new_content_id, last_error = null
  where content_topic_id = topic_row.content_topic_id;

  return jsonb_build_object('status', 'PUBLISHED', 'contentId', new_content_id, 'contentKey', v_content_key);
end;
$$;

revoke all on function public.content_factory_next_topic_v1() from public, anon, authenticated;
revoke all on function public.content_factory_update_topic_v1(text, text, text, text) from public, anon, authenticated;
revoke all on function public.content_factory_publish_v1(jsonb) from public, anon, authenticated;
grant execute on function public.content_factory_next_topic_v1() to service_role;
grant execute on function public.content_factory_update_topic_v1(text, text, text, text) to service_role;
grant execute on function public.content_factory_publish_v1(jsonb) to service_role;

commit;
