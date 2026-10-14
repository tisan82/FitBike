begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $repair$
declare i public."21_content_pipeline_image"%rowtype; j public."27_content_pipeline_source_stage_job"%rowtype;
 w text; req uuid; c jsonb; z jsonb;
begin
 -- One authorized incident only; never touch a changed candidate or active lease.
 select * into j from public."27_content_pipeline_source_stage_job"
 where job_id='8b9096b0-4fd4-411e-84d1-c2e8c67df8f2' for update;
 select * into i from public."21_content_pipeline_image" where pipeline_image_id=43482 for update;
 if not found or i.visual_phase is distinct from 'QA_PENDING' then return;end if;
 if i.claim_token is not null and i.claim_expires_at>now() then raise exception 'DUPLICATE_INCIDENT_BUSY';end if;
 if i.review_candidate->>'jobId' is distinct from j.job_id::text
  or j.pipeline_image_id is distinct from i.pipeline_image_id
  or j.result->>'sha256' is distinct from 'e56beb27734d1d80bc62dd263cf81f390e88daa6606266540370121f7c60cbf3'
  or j.contract_hash is distinct from i.generation_contract_hash then raise exception 'DUPLICATE_INCIDENT_CHANGED';end if;
 if public.content_pipeline_duplicate_source_id_v1(i.pipeline_image_id,j.spec,
    coalesce(j.result->>'preStagingSourceSha256',j.result->'provenance'->>'sourceSha256')) is null then raise exception 'DUPLICATE_INCIDENT_NOT_CONFIRMED';end if;
 w:=j.spec->'visualMcpOperation'->>'workerKey';req:=extensions.gen_random_uuid();
 c:=public.content_pipeline_claim_visual_stage_v1(w,req,'REVIEWER',i.pipeline_image_id);
 if c->>'activeClaim' is distinct from 'true' then raise exception 'DUPLICATE_INCIDENT_NOT_CLAIMED';end if;
 z:=public.content_pipeline_return_duplicate_visual_candidate_v1(w,req,j.job_id,j.result->>'sha256');
 if z->>'activeClaim' is distinct from 'false' or z->>'visualPhase' is distinct from 'PRODUCTION_PENDING' then raise exception 'DUPLICATE_INCIDENT_NOT_CLOSED';end if;
end $repair$;
commit;
