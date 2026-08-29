import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ServiceShop, ServiceType } from "@/features/service-shop/types/service-shop.types";

type ShopRow = {
  service_shop_id: number;
  shop_name: string;
  address: string;
  road_address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  business_hours: Record<string, string> | null;
  description: string | null;
  naver_place_url: string | null;
  website_url: string | null;
  external_rating: number | null;
  external_review_count: number | null;
  review_summary: string | null;
  review_keywords: string[] | null;
  review_source_count: number | null;
  review_checked_at: string | null;
  sido_name: string | null;
  sigungu_name: string | null;
  subdistrict_name: string | null;
  dong_name: string | null;
};

type ServiceRow = {
  service_shop_id: number;
  service_type: ServiceType;
};

export async function getPublishedServiceShops(): Promise<ServiceShop[]> {
  const supabase = createServerSupabaseClient();
  const [{ data: shops, error: shopError }, { data: services, error: serviceError }] = await Promise.all([
    supabase
      .from("20_service_shop")
      .select("service_shop_id,shop_name,address,road_address,latitude,longitude,phone,business_hours,description,naver_place_url,website_url,external_rating,external_review_count,review_summary,review_keywords,review_source_count,review_checked_at,sido_name,sigungu_name,subdistrict_name,dong_name")
      .eq("is_active", true)
      .eq("verification_status", "VERIFIED")
      .order("shop_name"),
    supabase
      .from("21_service_shop_service")
      .select("service_shop_id,service_type")
      .eq("verification_status", "VERIFIED"),
  ]);

  if (shopError) throw shopError;
  if (serviceError) throw serviceError;

  const serviceMap = new Map<number, ServiceType[]>();
  for (const row of (services ?? []) as ServiceRow[]) {
    const current = serviceMap.get(row.service_shop_id) ?? [];
    current.push(row.service_type);
    serviceMap.set(row.service_shop_id, current);
  }

  return ((shops ?? []) as ShopRow[]).map((row) => ({
    serviceShopId: row.service_shop_id,
    shopName: row.shop_name,
    address: row.address,
    roadAddress: row.road_address,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone,
    businessHours: row.business_hours,
    description: row.description,
    naverPlaceUrl: row.naver_place_url,
    websiteUrl: row.website_url,
    externalRating: row.external_rating === null ? null : Number(row.external_rating),
    externalReviewCount: row.external_review_count ?? 0,
    reviewSummary: row.review_summary,
    reviewKeywords: row.review_keywords ?? [],
    reviewSourceCount: row.review_source_count ?? 0,
    reviewCheckedAt: row.review_checked_at,
    sidoName: row.sido_name,
    sigunguName: row.sigungu_name,
    subdistrictName: row.subdistrict_name,
    dongName: row.dong_name,
    services: serviceMap.get(row.service_shop_id) ?? [],
  }));
}
