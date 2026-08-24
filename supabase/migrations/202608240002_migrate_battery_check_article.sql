begin;

do $$
declare
  article_content_id bigint;
begin
  insert into public."12_content" (content_key, title, summary, content_type, body_blocks, is_active, published_at)
  values (
    'battery-check-before-replace',
    '바이크 배터리 교체 전에 꼭 확인해야 할 5가지',
    '시동 문제? 바로 교체하지 마세요. 배터리 상태를 스스로 판단할 수 있는 체크리스트와 실제 사례를 제공합니다.',
    'MAINTENANCE',
    jsonb_build_array(
      jsonb_build_object('type', 'paragraph', 'text', '시동이 안 걸리면 대부분 배터리를 의심합니다. 하지만 실제로는 다른 원인인 경우도 많습니다. 아래 체크리스트로 먼저 판단해보세요.'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '빠른 자가 진단'),
      jsonb_build_object('type', 'bullet_list', 'items', jsonb_build_array('시동이 평소보다 느리다', '계기판 불빛이 약하다', '최근 장기간 운행 안 했다', '배터리 사용 2년 이상', '단자에 부식이 있다')),
      jsonb_build_object('type', 'tip', 'body', '2개 이상 해당되면 배터리 점검 또는 교체를 고려하세요.'),
      jsonb_build_object('type', 'paragraph', 'text', '배터리 상태는 외관과 전압 상태를 함께 확인해야 합니다.'),
      jsonb_build_object('type', 'step', 'title', '시동이 느리게 걸린다', 'body', '전압이 부족할 가능성이 있지만 기온 영향도 있음'),
      jsonb_build_object('type', 'step', 'title', '계기판 불빛이 약하다', 'body', '전력 공급이 불안정한 상태'),
      jsonb_build_object('type', 'step', 'title', '장기간 운행 안 했다', 'body', '자연 방전 가능성 높음'),
      jsonb_build_object('type', 'step', 'title', '2년 이상 사용', 'body', '배터리 수명 도달 가능성'),
      jsonb_build_object('type', 'step', 'title', '단자 부식', 'body', '배터리 문제 아닌 접촉 문제일 수 있음'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '실제 사례'),
      jsonb_build_object('type', 'step', 'title', 'Case 1: 시동 불량 → 배터리 문제 아님', 'body', '단자 접촉 불량으로 시동이 안 걸린 경우'),
      jsonb_build_object('type', 'step', 'title', 'Case 2: 겨울 방전 → 충전으로 해결', 'body', '배터리 교체 없이 복구 가능'),
      jsonb_build_object('type', 'step', 'title', 'Case 3: 3년 사용 → 실제 교체 필요', 'body', '수명 종료로 교체'),
      jsonb_build_object('type', 'heading', 'level', 2, 'text', '결론'),
      jsonb_build_object('type', 'paragraph', 'text', '배터리 문제는 단순 증상만으로 판단하면 오판 가능성이 높습니다. 반드시 기준을 가지고 판단해야 합니다.'),
      jsonb_build_object('type', 'heading', 'level', 3, 'text', '내 바이크에 맞는 배터리 확인하기'),
      jsonb_build_object('type', 'paragraph', 'text', 'FitBike에서는 차량 기준으로 정확한 배터리 규격을 확인할 수 있습니다.')
    ),
    true,
    now()
  )
  returning content_id into article_content_id;

  insert into public."15_content_part_link" (content_id, part_type, scope_type, display_order, is_active)
  values (article_content_id, 'BATTERY', 'CATEGORY', 0, true);
end
$$;

commit;
