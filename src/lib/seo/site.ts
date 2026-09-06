export const SITE_URL = "https://fitbike.co.kr";
export const SITE_NAME = "핏바이크";
export const SITE_ALTERNATE_NAME = "FitBike";
export const DEFAULT_TITLE = "핏바이크 | 오토바이 부품 규격·정비 관리 가이드";
export const DEFAULT_DESCRIPTION = "핏바이크에서 오토바이 모델·연식별 타이어, 배터리, 브레이크 규격과 점검·교체·DIY 관리 방법, 주변 정비소 정보를 확인하세요.";
export const DEFAULT_OG_IMAGE = "/images/logo/fitbike-logo_1.png";
export function absoluteUrl(path: string) { return new URL(path, SITE_URL).toString(); }
