import { createServerSupabaseClient } from "@/lib/supabase/server";

export type BrandRow = {
  brand_id: number;
  brand_key: string;
  brand_en: string;
  brand_ko: string | null;
  logo_image_url: string | null;
};

export type ModelRow = {
  bike_model_id: number;
  model_key: string;
  model_name_en: string;
  model_name_ko: string | null;
  default_category: string | null;
  engine_cc: number | null;
};

export type YearRow = {
  bike_model_year_id: number;
  year_range_label: string;
  start_year: number;
  end_year: number | null;
  generation_name: string | null;
  trim_name: string | null;
  variant_name: string | null;
};

export async function findActiveBrands(): Promise<BrandRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("01_brand")
    .select("brand_id, brand_key, brand_en, brand_ko, logo_image_url")
    .eq("is_active", true)
    .order("brand_ko", { ascending: true, nullsFirst: false })
    .order("brand_en", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as BrandRow[];
}

export async function findActiveModelsByBrand(
  brandId: number,
): Promise<ModelRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("02_bike_model")
    .select(
      "bike_model_id, model_key, model_name_en, model_name_ko, default_category, engine_cc",
    )
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .order("model_name_ko", { ascending: true, nullsFirst: false })
    .order("model_name_en", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ModelRow[];
}

export async function findActiveYearsByModel(
  bikeModelId: number,
): Promise<YearRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("03_bike_model_year")
    .select(
      "bike_model_year_id, year_range_label, start_year, end_year, generation_name, trim_name, variant_name",
    )
    .eq("bike_model_id", bikeModelId)
    .eq("is_active", true)
    .order("start_year", { ascending: false })
    .order("bike_model_year_id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as YearRow[];
}
