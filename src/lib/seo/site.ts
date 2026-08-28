export const SITE_URL = "https://fitbike.co.kr";
export const SITE_NAME = "FitBike";
export const DEFAULT_TITLE = "FitBike - 오토바이 모델별 부품 규격과 정비·관리 가이드";
export const DEFAULT_DESCRIPTION = "오토바이 모델과 연식별 타이어·배터리·브레이크 규격, 호환 정보와 배터리·타이어·체인·엔진오일 등 점검·DIY 관리 가이드를 확인하세요.";
export const DEFAULT_OG_IMAGE = "/images/logo/fitbike-logo_1.png";
export function absoluteUrl(path: string) { return new URL(path, SITE_URL).toString(); }
