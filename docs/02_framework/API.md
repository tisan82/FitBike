# FitBike API Guide

**Version:** v1.1\
**Status:** Baseline

## Principles

Service Module Driven / Contract First / Stable Response / Minimal
Exposure.

Public API baseline은 `/api/v1`.

## MVP Scope

브랜드, 모델, 연식, Fitment 결과, 상품 연결, 콘텐츠 조회.

## Contract

기존 endpoint/method/response field/type/필수 parameter를 임의 변경하지
않는다. Breaking Change는 승인 필요. 소비 화면에 필요한 필드만 노출한다.
Page component에 API/data business logic을 직접 작성하지 않는다.

## Security

`SUPABASE_SERVICE_ROLE_KEY`를 client에서 사용하지 않는다.
RLS/public-data boundary를 준수한다.

API를 의도적으로 변경하면 관련 API/Service Module 문서를 함께 갱신한다.
