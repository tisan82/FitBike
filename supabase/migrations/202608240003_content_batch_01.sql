begin;

do $$
declare
  pcx125_model_id bigint;
  tire_guide_content_id bigint;
  battery_guide_content_id bigint;
begin
  if exists (
    select 1 from public."12_content"
    where content_key in ('tire-replacement-check-guide', 'pcx125-battery-guide')
  ) then
    raise exception 'Content batch 01 key already exists';
  end if;

  select model.bike_model_id
  into strict pcx125_model_id
  from public."02_bike_model" as model
  join public."01_brand" as brand on brand.brand_id = model.brand_id
  where model.model_key = 'HONDA_PCX125'
    and model.model_name_en = 'PCX125'
    and model.is_active = true
    and brand.brand_en = 'HONDA'
    and brand.is_active = true;

  insert into public."12_content" (
    content_key, title, summary, content_type, body_blocks, is_active, published_at
  ) values (
    'tire-replacement-check-guide',
    '오토바이 타이어 교체 전 확인할 것',
    '오토바이 타이어를 교체하기 전에 규격, 앞·뒤 장착 위치, 튜브 타입과 현재 타이어 상태를 확인하는 방법을 정리합니다.',
    'MAINTENANCE',
    jsonb_build_array(
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '타이어 교체 전에 무엇을 확인해야 하나요?'),
      jsonb_build_object('type', 'paragraph', 'text', '타이어를 교체하기 전에 현재 규격과 앞·뒤 장착 위치, 타이어 구조와 상태를 먼저 확인해야 합니다.'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '1. 현재 타이어 규격 확인'),
      jsonb_build_object('type', 'paragraph', 'text', '현재 장착된 타이어의 사이드월에서 규격을 확인하세요. 표기는 120/70ZR17 M/C 58W TL과 같은 형태입니다.'),
      jsonb_build_object('type', 'tip', 'title', '타이어 규격 읽는 법', 'body', '규격 표기의 자세한 의미는 「타이어 규격 읽는 법」 콘텐츠에서 확인할 수 있습니다.'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '2. 앞·뒤 타이어 구분'),
      jsonb_build_object('type', 'paragraph', 'text', '타이어의 FRONT 또는 REAR 표기와 실제 바이크 제원을 기준으로 장착 위치를 확인하세요. 앞·뒤 규격이 같아 보여도 임의로 위치를 바꾸지 않습니다.'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '3. TL / TT 확인'),
      jsonb_build_object('type', 'paragraph', 'text', '현재 타이어가 튜브리스(TL)인지 튜브 타입(TT)인지 확인하고 같은 사용 조건에 맞는 제품인지 살펴보세요.'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '4. 현재 타이어 상태 확인'),
      jsonb_build_object('type', 'bullet_list', 'items', jsonb_build_array('마모 상태', '외관 손상', '균열', '이물질', '공기압 상태')),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '5. 바이크 모델과 연식 확인'),
      jsonb_build_object('type', 'paragraph', 'text', '같은 모델명이라도 연식이나 세대에 따라 타이어 규격이 달라질 수 있으므로 정확한 바이크 모델과 연식을 확인하세요.'),
      jsonb_build_object('type', 'warning', 'title', '실제 장착 전 확인', 'body', '실제 장착 전에는 바이크 제조사 제원과 선택한 제품 규격을 함께 확인해야 합니다.')
    ),
    true,
    now()
  )
  returning content_id into tire_guide_content_id;

  insert into public."15_content_part_link" (
    content_id, part_type, scope_type, display_order, is_active
  ) values (tire_guide_content_id, 'TIRE', 'CATEGORY', 0, true);

  insert into public."12_content" (
    content_key, title, summary, content_type, body_blocks, is_active, published_at
  ) values (
    'pcx125-battery-guide',
    'PCX125 배터리 규격 및 교체 전 확인 가이드',
    '혼다 PCX125의 연식별 배터리 정보를 확인하고 교체 전에 규격과 단자 방향 등 필요한 사항을 점검하는 방법을 정리합니다.',
    'MODEL_GUIDE',
    jsonb_build_array(
      jsonb_build_object('type', 'heading', 'level', 2, 'text', 'PCX125 배터리를 확인하기 전에'),
      jsonb_build_object('type', 'paragraph', 'text', '같은 PCX125라도 연식이나 세대에 따라 부품 정보가 달라질 수 있으므로 먼저 정확한 연식을 확인해야 합니다.'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '연식별 배터리 정보'),
      jsonb_build_object(
        'type', 'table',
        'headers', jsonb_build_array('연식', '세대', '배터리 규격', '전압'),
        'rows', jsonb_build_array(
          jsonb_build_array('2010~2013', '1세대', 'YTZ7S', '12V'),
          jsonb_build_array('2014~2017', '2세대', 'YTZ8V', '12V'),
          jsonb_build_array('2018~2020', '3세대', 'YTZ8V', '12V')
        )
      ),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '배터리 교체 전에 확인할 것'),
      jsonb_build_object('type', 'numbered_list', 'items', jsonb_build_array('배터리 규격', '단자 방향', '장착 공간', '현재 배터리 표기')),
      jsonb_build_object('type', 'tip', 'body', 'FitBike의 PCX125 모델 상세에서 선택 연식의 부품 정보를 확인하세요.'),
      jsonb_build_object('type', 'warning', 'title', '실제 교체 전 확인', 'body', '실제 교체 작업 전에는 차량 매뉴얼과 현재 장착된 제품의 표기를 함께 확인하세요.'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', 'PCX125 모델 정보 확인'),
      jsonb_build_object('type', 'paragraph', 'text', '타이어·배터리·브레이크 등 모델과 연식별 정보는 FitBike에서 확인할 수 있습니다.')
    ),
    true,
    now()
  )
  returning content_id into battery_guide_content_id;

  insert into public."13_content_bike_model" (content_id, bike_model_id)
  values (battery_guide_content_id, pcx125_model_id);

  insert into public."15_content_part_link" (
    content_id, part_type, scope_type, display_order, is_active
  ) values (battery_guide_content_id, 'BATTERY', 'CATEGORY', 0, true);
end
$$;

commit;
