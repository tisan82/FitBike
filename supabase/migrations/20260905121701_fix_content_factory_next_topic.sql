begin;

create or replace function public.content_factory_next_topic_v1()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select to_jsonb(q)
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
  ) q;
$$;

revoke all on function public.content_factory_next_topic_v1() from public, anon, authenticated;
grant execute on function public.content_factory_next_topic_v1() to service_role;

commit;
