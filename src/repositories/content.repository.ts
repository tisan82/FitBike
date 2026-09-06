import { createServerSupabaseClient } from "@/lib/supabase/server";

const CONTENT_LIST_COLUMNS =
  "content_id,content_key,title,summary,content_type,thumbnail_image_storage_path,published_at";
const CONTENT_DETAIL_COLUMNS = `${CONTENT_LIST_COLUMNS},hero_image_storage_path,body_blocks,created_at,updated_at`;

export type ContentListRow = {
  content_id: number;
  content_key: string;
  title: string;
  summary: string;
  content_type: string;
  thumbnail_image_storage_path: string | null;
  published_at: string;
};

export type ContentDetailRow = ContentListRow & {
  hero_image_storage_path: string | null;
  body_blocks: unknown;
  created_at: string;
  updated_at: string;
};

export type ContentBikeModelRelationRow = { content_id: number; bike_model_id: number };
export type RelatedBikeRow = { bike_model_id: number; brand_id: number; model_name_en: string; model_name_ko: string | null };
export type RelatedBikeBrandRow = { brand_id: number; brand_en: string; brand_ko: string | null };
export type RelatedBikeYearRow = { bike_model_year_id: number; bike_model_id: number };

export async function findPublishedContents(): Promise<ContentListRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await createServerSupabaseClient()
    .from("12_content")
    .select(CONTENT_LIST_COLUMNS)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .lte("published_at", now)
    .order("published_at", { ascending: false })
    .order("content_id", { ascending: false });

  if (error) throw new Error(`Failed to load published contents: ${error.message}`);
  return (data ?? []) as ContentListRow[];
}

export async function findLatestPublishedContentDetails(limit = 50): Promise<ContentDetailRow[]> {
  const now = new Date().toISOString();
  const { data, error } = await createServerSupabaseClient()
    .from("12_content")
    .select(CONTENT_DETAIL_COLUMNS)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .lte("published_at", now)
    .order("published_at", { ascending: false })
    .order("content_id", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load published content feed: ${error.message}`);
  return (data ?? []) as ContentDetailRow[];
}

export async function findPublishedContentByKey(
  contentKey: string,
): Promise<ContentDetailRow | null> {
  const now = new Date().toISOString();
  const { data, error } = await createServerSupabaseClient()
    .from("12_content")
    .select(CONTENT_DETAIL_COLUMNS)
    .eq("content_key", contentKey)
    .eq("is_active", true)
    .not("published_at", "is", null)
    .lte("published_at", now)
    .maybeSingle();

  if (error) throw new Error(`Failed to load published content: ${error.message}`);
  return data as ContentDetailRow | null;
}

export async function findContentBikeModelRelationsByContentId(contentId: number): Promise<ContentBikeModelRelationRow[]> {
  const { data, error } = await createServerSupabaseClient().from("13_content_bike_model").select("content_id,bike_model_id").eq("content_id", contentId).order("content_bike_model_id", { ascending: true });
  if (error) throw new Error(`Failed to load content bike relations: ${error.message}`);
  return (data ?? []) as ContentBikeModelRelationRow[];
}

export async function findContentBikeModelRelationsByBikeModelId(bikeModelId: number): Promise<ContentBikeModelRelationRow[]> {
  const { data, error } = await createServerSupabaseClient().from("13_content_bike_model").select("content_id,bike_model_id").eq("bike_model_id", bikeModelId).order("content_bike_model_id", { ascending: false });
  if (error) throw new Error(`Failed to load bike content relations: ${error.message}`);
  return (data ?? []) as ContentBikeModelRelationRow[];
}

export async function findPublishedContentsByIds(contentIds: number[], limit?: number): Promise<ContentListRow[]> {
  if (contentIds.length === 0) return [];
  let query = createServerSupabaseClient().from("12_content").select(CONTENT_LIST_COLUMNS).in("content_id", contentIds).eq("is_active", true).not("published_at", "is", null).lte("published_at", new Date().toISOString()).order("published_at", { ascending: false }).order("content_id", { ascending: false });
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load related contents: ${error.message}`);
  return (data ?? []) as ContentListRow[];
}

export async function findActiveRelatedBikes(bikeModelIds: number[]): Promise<RelatedBikeRow[]> {
  if (bikeModelIds.length === 0) return [];
  const { data, error } = await createServerSupabaseClient().from("02_bike_model").select("bike_model_id,brand_id,model_name_en,model_name_ko").in("bike_model_id", bikeModelIds).eq("is_active", true);
  if (error) throw new Error(`Failed to load related bikes: ${error.message}`);
  return (data ?? []) as RelatedBikeRow[];
}

export async function findActiveRelatedBikeBrands(brandIds: number[]): Promise<RelatedBikeBrandRow[]> {
  if (brandIds.length === 0) return [];
  const { data, error } = await createServerSupabaseClient().from("01_brand").select("brand_id,brand_en,brand_ko").in("brand_id", brandIds).eq("is_active", true);
  if (error) throw new Error(`Failed to load related bike brands: ${error.message}`);
  return (data ?? []) as RelatedBikeBrandRow[];
}

export async function findLatestActiveRelatedBikeYears(bikeModelIds: number[]): Promise<RelatedBikeYearRow[]> {
  if (bikeModelIds.length === 0) return [];
  const { data, error } = await createServerSupabaseClient().from("03_bike_model_year").select("bike_model_year_id,bike_model_id").in("bike_model_id", bikeModelIds).eq("is_active", true).order("start_year", { ascending: false }).order("bike_model_year_id", { ascending: false });
  if (error) throw new Error(`Failed to load related bike years: ${error.message}`);
  return (data ?? []) as RelatedBikeYearRow[];
}
