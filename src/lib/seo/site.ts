export const SITE_URL = "https://fitbike.co.kr";
export const SITE_NAME = "FitBike";
export const DEFAULT_DESCRIPTION = "오토바이 모델과 연식을 기준으로 타이어, 배터리, 브레이크 규격과 호환 부품 정보를 확인할 수 있는 FitBike.";
export const DEFAULT_OG_IMAGE = "/images/logo/fitbike-logo_1.png";
export function absoluteUrl(path: string) { return new URL(path, SITE_URL).toString(); }
