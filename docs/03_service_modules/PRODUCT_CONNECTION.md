# Service Module --- Product Connection

**Version:** v1.0\
**Status:** Baseline

Fitment/specification과 상품을 명시적 DB 관계로 연결한다. 명시적 정책
없이 상품 랭킹/추천을 만들지 않는다. 상품 연결이 없으면 Empty 상태로
처리하며 대체 상품을 임의 추정하지 않는다. 외부 상품 URL은 Commerce
Gateway이며 FitBike 내부 결제 계약을 의미하지 않는다.
