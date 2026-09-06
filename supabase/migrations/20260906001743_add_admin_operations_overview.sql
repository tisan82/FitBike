begin;

create or replace function public.admin_operations_overview_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'publishedContents', (select count(*) from public."12_content" c where c.is_active = true and c.published_at is not null and c.published_at <= now()),
      'plannedTopics', (select count(*) from public."16_content_topic" t where t.status = 'PLANNED'),
      'generatingTopics', (select count(*) from public."16_content_topic" t where t.status = 'GENERATING'),
      'reviewRequiredTopics', (select count(*) from public."16_content_topic" t where t.status = 'REVIEW_REQUIRED'),
      'approvedTopics', (select count(*) from public."16_content_topic" t where t.status = 'APPROVED'),
      'blockedTopics', (select count(*) from public."16_content_topic" t where t.status = 'BLOCKED'),
      'pendingSourceReviews', (select count(*) from public."17_content_asset_source" s where s.rights_status = 'PENDING_REVIEW')
    ),
    'topics', coalesce((
      select jsonb_agg(to_jsonb(q))
      from (
        select
          t.content_topic_id as "contentTopicId",
          t.topic_key as "topicKey",
          t.topic,
          t.content_type as "contentType",
          t.part_type as "partType",
          t.status,
          t.priority,
          t.risk_level as "riskLevel",
          t.automation_level as "automationLevel",
          t.attempt_count as "attemptCount",
          t.last_error as "lastError",
          t.content_id as "contentId",
          t.updated_at as "updatedAt"
        from public."16_content_topic" t
        order by
          case t.status when 'BLOCKED' then 1 when 'REVIEW_REQUIRED' then 2 when 'APPROVED' then 3 when 'GENERATING' then 4 when 'PLANNED' then 5 else 6 end,
          t.priority,
          t.updated_at desc,
          t.content_topic_id desc
        limit 100
      ) q
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_operations_overview_v1() from public, anon, authenticated;
grant execute on function public.admin_operations_overview_v1() to service_role;

commit;
