create or replace function public.content_pipeline_publish_queue_v1()
returns jsonb
language sql
security definer
set search_path=''
stable
as $$
  select jsonb_build_object(
    'count', count(*),
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pipelineId', p.pipeline_id,
          'contentTopicId', p.content_topic_id,
          'topicKey', p.topic_key,
          'contentKey', p.content_key,
          'title', coalesce(
            nullif(p.writer_artifact->>'final_title',''),
            nullif(p.planning_artifact->>'customer_question',''),
            p.topic_key
          ),
          'stage', p.stage,
          'ownershipState', p.ownership_state,
          'qaCheckedAt', p.qa_artifact->>'checked_at',
          'updatedAt', p.updated_at
        )
        order by p.updated_at, p.pipeline_id
      ),
      '[]'::jsonb
    )
  )
  from public."18_content_pipeline" p
  where p.stage='QA_PASS'
    and p.ownership_state='CLAIMED';
$$;

revoke all on function public.content_pipeline_publish_queue_v1()
from public, anon, authenticated;

grant execute on function public.content_pipeline_publish_queue_v1()
to service_role;

comment on function public.content_pipeline_publish_queue_v1() is
'Internal scheduled Content Factory publish queue. Returns all QA_PASS CLAIMED items oldest first; service_role only.';
