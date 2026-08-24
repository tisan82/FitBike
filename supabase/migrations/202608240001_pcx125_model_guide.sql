begin;

do $$
declare
  pcx125_model_id bigint;
  guide_content_id bigint;
begin
  select model.bike_model_id
  into strict pcx125_model_id
  from public."02_bike_model" as model
  join public."01_brand" as brand on brand.brand_id = model.brand_id
  where model.model_key = 'HONDA_PCX125'
    and model.model_name_en = 'PCX125'
    and model.is_active = true
    and brand.brand_en = 'HONDA'
    and brand.is_active = true;

  insert into public."12_content" (content_key, title, summary, content_type, body_blocks, is_active, published_at)
  values (
    'pcx125-tire-guide',
    'PCX125 타이어 규격 및 선택 가이드',
    '혼다 PCX125의 연식별 타이어 규격과 타이어 선택 전에 확인할 정보를 정리합니다.',
    'MODEL_GUIDE',
    jsonb_build_array(
      jsonb_build_object('type', 'heading', 'level', 2, 'text', 'PCX125 타이어를 확인하기 전에'),
      jsonb_build_object('type', 'paragraph', 'text', 'PCX125는 연식이나 세대에 따라 타이어 규격이 달라질 수 있으므로 먼저 정확한 연식을 확인해야 합니다.'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '연식별 타이어 규격'),
      jsonb_build_object(
        'type', 'table',
        'headers', jsonb_build_array('연식', '앞 타이어', '뒤 타이어'),
        'rows', jsonb_build_array(
          jsonb_build_array('2010~2013 (1세대)', '90/90 - 14 M/C 46P TL', '100/90 - 14 M/C 57P REINF TL'),
          jsonb_build_array('2014~2017 (2세대)', '90/90 - 14 M/C 46P TL', '100/90 - 14 M/C 57P REINF TL'),
          jsonb_build_array('2018~2020 (3세대)', '100/80 - 14 48P TL', '120/70 - 14 61P REINF TL')
        )
      ),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '타이어 규격을 읽는 방법'),
      jsonb_build_object('type', 'paragraph', 'text', '규격 표기의 폭, 편평비, 휠 지름을 차례로 확인하세요. 하중지수와 속도등급, 튜브리스 표기도 함께 확인해야 합니다.'),
      jsonb_build_object('type', 'tip', 'title', '정확한 장착 가능 여부 확인', 'body', 'FitBike의 모델·연식별 적합 정보를 확인한 뒤 실제 차량 표기와 제조사 안내를 함께 확인하세요.'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', 'PCX125 모델 정보 확인'),
      jsonb_build_object('type', 'paragraph', 'text', '연식별 타이어·배터리·브레이크 정보는 FitBike PCX125 모델 상세에서 확인할 수 있습니다.')
    ),
    true,
    now()
  )
  on conflict (content_key) do update set
    title = excluded.title,
    summary = excluded.summary,
    content_type = excluded.content_type,
    body_blocks = excluded.body_blocks,
    is_active = excluded.is_active,
    published_at = coalesce(public."12_content".published_at, excluded.published_at)
  returning content_id into guide_content_id;

  insert into public."13_content_bike_model" (content_id, bike_model_id)
  values (guide_content_id, pcx125_model_id)
  on conflict (content_id, bike_model_id) do nothing;

  insert into public."15_content_part_link" (content_id, part_type, scope_type, display_order, is_active)
  select guide_content_id, 'TIRE', 'CATEGORY', 0, true
  where not exists (
    select 1
    from public."15_content_part_link" as link
    where link.content_id = guide_content_id
      and link.part_type = 'TIRE'
      and link.scope_type = 'CATEGORY'
      and link.tire_model_id is null
      and link.tire_product_id is null
      and link.battery_product_id is null
      and link.brake_product_id is null
  );
end
$$;

commit;
