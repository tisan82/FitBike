export type ServiceType =
  | "TIRE"
  | "BATTERY"
  | "BRAKE"
  | "ENGINE_OIL"
  | "CHAIN"
  | "COOLANT"
  | "GENERAL_REPAIR";

export type ServiceShop = {
  serviceShopId: number;
  shopName: string;
  address: string;
  roadAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  businessHours: Record<string, string> | null;
  description: string | null;
  naverPlaceUrl: string | null;
  websiteUrl: string | null;
  externalRating: number | null;
  externalReviewCount: number;
  reviewSummary: string | null;
  reviewKeywords: string[];
  reviewSourceCount: number;
  reviewCheckedAt: string | null;
  sidoName: string | null;
  sigunguName: string | null;
  subdistrictName: string | null;
  dongName: string | null;
  services: ServiceType[];
};
