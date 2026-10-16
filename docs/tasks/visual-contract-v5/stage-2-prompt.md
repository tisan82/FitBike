# FitBike 1·2단계 통합 — 조사·작성·Source 공급

공식 통합 Authoring Queue에서 콘텐츠 1건을 조사·작성하고 제작용 Source까지 확보한다. 하나의 채팅에서 진행하며 별도 공급 채팅을 요구하지 않는다. 연결의 connectedRole=AUTHORING와 SOURCE_SUPPLY_V1을 확인한다. 파이프라인 쓰기는 현재 Authoring 도구만 사용하며 자료·이미지 탐색에는 실제 제공된 검색 도구를 사용할 수 있다. 외부 생성 API와 서버 모델은 사용하지 않는다. 이 공급 버전은 검증된 실사 Source용이다. 실제 생성·편집 결과를 실사 원본이라고 분류하지 않는다.

현재 AGENTS.md 및 CONTENT.md → CONTENT_FACTORY.md → CONTENT_QUEUE.md, 최신 Writer 도구 schema와 현재 Research Artifact를 확인한다. 도구가 없으면 Claim 전에 정확히 보고하고 없는 기능을 호출했다고 기록하지 않는다. 기존 미완료 자기 실행을 get_authoring_execution_status(requestId 또는 pipelineId)로 먼저 확인하고 다른 실행은 변경하지 않는다. get_visual_claim_result는 이미지용이며 Authoring 종료 여부를 판정하는 데 사용하지 않는다.

## Writer 처리

- Research의 실제 사실·CF ID·모델/연식·적용 범위와 Source를 사용한다. 근거·수치·CF ID·URL을 만들지 않는다.
- 고객 질문에 직접 답하는 본문과 현재 SEO 요구를 작성한다. 접근 위치·확인 방법·조건별 행동은 근거 범위 안에서 설명한다.
- 이미지가 필요한 경우 이미지마다 하나의 고객 질문과 실제 시각 대상을 정한다. 같은 피사체라도 보이지 않는 온도·재시동 성공·고장 원인을 이미지가 증명하도록 요구하지 않는다.

## 신규 image_briefs

각 신규 Brief는 다음 필드만 작성한다. wrapper/배열 이름은 현재 공식 Writer 저장 schema를 따른다.

contract_version: 5
image_id: IMG_01
asset_role: THUMBNAIL_HERO 또는 BODY 등 현재 허용 역할
user_question: 이미지가 답해야 하는 질문 하나
visual_objective: 실제로 보여줄 대상과 관계 한 문장
must_show: 실제로 식별해야 하는 필수 시각 대상 목록
must_not_show: 금지 대상·오인 표현 목록
evidence_requirement:
  level: NONE 고정 (이미지 제작 제한으로 사용하지 않음)
  fact_ids: Research에 실제 존재하는 CF ID 배열, 해당 없으면 []
  evidence_ref: 실제 확보한 근거 배열, 없으면 생략 또는 []
alt_text_draft: 실제 시각 대상 중심 ALT 초안

evidence_ref 원소는 실제 HTTPS source_ref와 선택적 model_scope, supports만 사용한다. supports는 해당 자료가 뒷받침하는 구조/사실 설명이다. 문서 URL과 실제 이미지 파일 URL을 혼동하지 않는다. URL 전달은 픽셀 검사 완료가 아니다.

이미지 근거 레벨을 분류하지 않는다. 모든 새 Brief의 level은 NONE이다. Source URL·기술자료는 선택적 참고이며 특정 URL·국문 자료·제작 방식을 강제하지 않는다. PDF 페이지·매뉴얼 도표·문서 캡처는 이미지 소재에서 제외하고 사진 중심 장면으로 기획한다. must_show는 핵심 1~2개 중심으로 정한다.

source_strategy/source_priority/generation_allowed/ai_edit_allowed/full_generation_allowed/reference_based_generation_allowed/composition_plan/annotation_contract/people_mode/pixel_qa_contract/qa_criteria/mobile_requirement/production_feasibility/production_flexibility를 신규 V5 Brief에 작성하지 않는다. Pipeline/Task/asset 운영 식별자는 서버가 관리한다.

모든 must_show가 실제 시각 대상인지 확인한다. 필수·금지 목록의 동일 항목이나 사람 필수/금지 충돌을 제거한다. 사람·손·라이더가 필요하면 필수 목록에 명시하고 금지하면 금지 목록에 명시한다. 사람 미지정 시 V5 서버 기본은 OPTIONAL이다. 구도/Inset/Source 탐색/편집 방식은 3-A가 선택한다. 이미지마다 핵심 질문 하나를 유지하되 제작이 어려운 요구를 QA 완화로 해결하지 않는다.

## 정확한 저장 패키지와 동일 Run 복구

complete_content_authoring의 package는 아래 V1 구조를 사용한다. version은 숫자 1이며 문자열 "1"이나 contract_version 5와 혼동하지 않는다. package 최상위에는 version/execution/planning/research/writer의 다섯 키만 허용한다. execution은 Claim 또는 Authoring 상태 조회의 packageExecution을 그대로 복사한다. planning/research는 비어 있지 않은 객체다. writer.authoringContext는 서버가 생성하므로 보내지 않는다. 기존 Writer 본문·SEO 필드는 writer 안에 유지하고 소스 공급 내역은 이 패키지에 추가하지 않는다.

아래는 구조 예시다. ID·주제·본문·근거·Brief는 현재 실행의 실제 산출물로 바꾼다. 이 예시의 내용이나 출처를 실제 조사 결과로 사용하지 않는다.

```json
{
  "pipelineId": 110,
  "pipelineRunId": 419,
  "package": {
    "version": 1,
    "execution": {
      "pipelineId": 110,
      "pipelineRunId": 419,
      "topicKey": "motorcycle-sidestand-interlock-stall-check"
    },
    "planning": {"customer_question": "현재 주제의 실제 고객 질문"},
    "research": {"fact_register": []},
    "writer": {
      "content_key": "motorcycle-sidestand-interlock-stall-check",
      "final_title": "실제 작성 제목",
      "image_briefs": [{
        "contract_version": 5,
        "image_id": "IMG_01",
        "asset_role": "THUMBNAIL_HERO",
        "user_question": "사이드스탠드 위치를 어디에서 확인하는가?",
        "visual_objective": "정차된 오토바이의 사이드스탠드 위치를 보여준다",
        "must_show": ["정차된 오토바이의 사이드스탠드"],
        "must_not_show": ["주행 중 점검"],
        "evidence_requirement": {"level": "NONE", "fact_ids": []},
        "alt_text_draft": "정차된 오토바이의 사이드스탠드 위치"
      }]
    }
  }
}
```

이 예시는 envelope/Brief 형식만 보여준다. 실제 완료 요청에는 작성한 본문·SEO·검증된 Research Fact를 기존 Writer 규약에 따라 반드시 포함한다.

저장 실패나 응답 유실 시 다음 순서를 따른다.

1. get_authoring_execution_status에 원래 requestId 또는 pipelineId를 전달한다. 상태 조회는 읽기 전용이며 Claim이나 종료를 수행하지 않는다.
2. activeExecution=true이면 반환된 pipelineId/pipelineRunId/packageExecution을 유지한다. 새 requestId로 재-Claim하거나 다른 Topic을 Claim하지 않는다.
3. REQUEST_VALIDATION + NOT_ATTEMPTED이면 field/reason이 가리킨 입력만 고쳐 동일 Run으로 complete_content_authoring을 다시 호출한다. 조사·본문을 불필요하게 재작성하지 않는다.
4. DB가 명시적으로 REJECTED를 반환해도 상태를 조회하고 같은 Run이 RUNNING이면 입력 수정 후 재개한다. UNVERIFIED_REQUIRES_READBACK은 성공/실패를 추정하지 말고 먼저 상태를 조회한다.
5. contentSaved=true와 runStatus=PASS이면 본문을 다시 저장하지 말고 get_authoring_source_supply로 실제 Tasks와 누락 소스를 확인한다. 공급만 재개할 때는 open_authoring_source_supply를 사용한다.
6. 같은 Run을 계속할 수 없으면 fail_content_authoring으로 그 Run을 공식 HOLD/BLOCKED 종료하고 Authoring 상태를 다시 조회한다. 종료됐다는 확인 없이 Claim이 없다고 보고하지 않는다. 기존 본문이 채팅에만 있으면 DB에 저장됐다고 표현하지 않는다.
7. 플랫폼 Safety Check 차단은 같은 호출 반복이나 다른 경로로 우회하지 않고 확인된 상태와 재개 지점을 보고한다.

## 저장 및 Source 공급 완료

1. claim_content_authoring(requestId,선택적 pipelineId)로 공식 통합 실행을 Claim한다. 반환 packageExecution을 보존하고 조사·사실 확인·본문·V5 기획을 한 번에 작성한다. 실패 시 fail_content_authoring으로 자기 run을 HOLD/BLOCKED 종료한다.
2. complete_content_authoring(pipelineId,pipelineRunId,package)에 기존 version/execution/planning/research/writer 패키지를 정확히 전달한다. 임의 최상위 sources 키를 넣지 않는다. 반환된 실제 imageTasks/Contract Hash와 missingImageIds를 사용한다. 본문 DRAFTED 저장은 Source 공급 완료가 아니다.
3. 같은 채팅에서 각 이미지 Contract를 충족하는 실사 Source를 찾는다. 문서/HTML URL은 resolve_visual_source_assets로 실제 파일을 추출하고, 직접 이미지 URL은 preview_authoring_source로 실제 390px 픽셀과 원본 SHA를 확인한다. 필수·금지 대상과 장착 상태·매체·실재성까지 관찰한다. 출처/URL/파일을 추정하지 않는다.
4. 실제 픽셀을 본 뒤 persist_authoring_source에 pipelineRunId/pipelineImageId/operationId/현재 contractHash, 출처 URL·owner, sourceObservation={expectedSha:실제 원본 SHA,pixelsInspected:true,evidence:관찰 내용}를 전달한다. sourceRole=PRODUCTION_INPUT은 현재 장면을 결정적 Crop/표기 등으로 완성할 수 있을 때만 사용한다. 추가 Native 편집이 필요한 참고는 REFERENCE_ONLY와 nativeEditRequired=true로 기록한다. URL만 남기지 않고 READY/Storage read-back 결과를 확인한다.
5. get_authoring_source_supply(pipelineId)로 다시 조회한다. 모든 제작 이미지의 missingImageIds=[]와 선택된 READY 입력이 확인돼야 공급 완료다. 미확보는 실제 탐색 결과와 누락 이미지 ID를 보고하며 성공으로 만들지 않는다. 본문/Contract는 보존한다.
6. 공급만 재개할 때 open_authoring_source_supply(pipelineId)를 사용하고 반환 run/Task/hash로 누락 파일만 채운다. 새 본문·Topic 생성·Production Claim은 하지 않는다.

서버의 기술 PASS는 final Pixel QA가 아니다. 이미지 제작·QA_PENDING 인계, Reviewer 승인, 3-B 등록·DONE, 4단계 게시, 코드/DB/예약 설정 변경은 하지 않는다.

최종 보고: Pipeline/Topic, 본문 저장 상태, 전체 이미지 수/제작 입력 준비 수/참고용 수/미확보 수, 공급 supplyId·원본 SHA, missingImageIds 및 다음 담당. 다음 담당은 3-A 제작이며 준비된 자산으로 제작·실제 픽셀 QA·검수 인계를 진행한다.
