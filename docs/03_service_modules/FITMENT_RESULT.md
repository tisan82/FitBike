# Service Module --- Fitment Result

**Version:** v1.0\
**Status:** Baseline

선택된 `bikeModelYearId` 기준으로 Fitment 정보를 제공한다.
`03_bike_model_year`가 기준 Entity이며 Tire/Battery/Brake 호환은 기존 DB
관계/규격을 사용한다. Mapping이 없으면 호환성을 추정하지 않는다.
화면에서는 선택 바이크 context와 규격/Fitment 정보를 구매 Action보다
우선한다.
