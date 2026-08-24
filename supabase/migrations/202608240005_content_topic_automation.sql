begin;

alter table public."16_content_topic"
  add column automation_level text not null default 'L1',
  add column risk_level text not null default 'MEDIUM',
  add column attempt_count integer not null default 0,
  add column last_error text;

alter table public."16_content_topic"
  add constraint "16_content_topic_automation_level_check"
    check (automation_level = any (array['L1'::text, 'L2'::text])),
  add constraint "16_content_topic_risk_level_check"
    check (risk_level = any (array['LOW'::text, 'MEDIUM'::text, 'HIGH'::text])),
  add constraint "16_content_topic_attempt_count_check"
    check (attempt_count between 0 and 2);

commit;
