import { createServerSupabaseClient } from "@/lib/supabase/server";

export type BikeModelYearRow = {
  bike_model_year_id: number;
  bike_model_id: number;
  year_range_label: string;
  start_year: number;
  end_year: number | null;
  generation_name: string | null;
  category_override: string | null;
  engine_cc_override: number | null;
  generation_image_url: string | null;
  front_tire_full_size: string | null;
  rear_tire_full_size: string | null;
};

export type BikeModelRow = {
  bike_model_id: number;
  brand_id: number;
  model_key: string;
  model_name_en: string;
  model_name_ko: string | null;
  default_category: string | null;
  engine_cc: number | null;
  model_image_url: string | null;
};

export type BrandRow = {
  brand_id: number;
  brand_en: string;
  brand_ko: string | null;
};

export type TireFitmentRow = {
  id: number;
  tire_product_id: number;
  position_type: "FRONT" | "REAR";
  match_type: string;
  display_order: number;
};

export type TireProductRow = {
  tire_product_id: number;
  tire_product_key: string;
  brand_name: string;
  product_name: string;
  tire_size_full: string | null;
  width: number | null;
  ratio: number | null;
  diameter: number | null;
  load_index: number | null;
  speed_index: string | null;
  tube_type: string | null;
  position_type: "FRONT" | "REAR" | "BOTH" | "COMMON" | null;
  product_image_url: string | null;
  product_url: string | null;
  seller_name: string | null;
  price: number | null;
};

export async function findActiveBikeModelYear(
  bikeModelYearId: number,
): Promise<BikeModelYearRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("03_bike_model_year")
    .select(
      "bike_model_year_id, bike_model_id, year_range_label, start_year, end_year, generation_name, category_override, engine_cc_override, generation_image_url, front_tire_full_size, rear_tire_full_size",
    )
    .eq("bike_model_year_id", bikeModelYearId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BikeModelYearRow | null;
}

export async function findActiveBikeModel(
  bikeModelId: number,
): Promise<BikeModelRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("02_bike_model")
    .select(
      "bike_model_id, brand_id, model_key, model_name_en, model_name_ko, default_category, engine_cc, model_image_url",
    )
    .eq("bike_model_id", bikeModelId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BikeModelRow | null;
}

export async function findActiveBrand(brandId: number): Promise<BrandRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("01_brand")
    .select("brand_id, brand_en, brand_ko")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BrandRow | null;
}

export async function findActiveTireFitments(
  bikeModelYearId: number,
): Promise<TireFitmentRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("07_bike_model_year_tire_product")
    .select("id, tire_product_id, position_type, match_type, display_order")
    .eq("bike_model_year_id", bikeModelYearId)
    .eq("is_active", true)
    .order("position_type", { ascending: true })
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TireFitmentRow[];
}

export async function findActiveTireProducts(
  tireProductIds: number[],
): Promise<TireProductRow[]> {
  if (tireProductIds.length === 0) return [];

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("04_tire_product")
    .select(
      "tire_product_id, tire_product_key, brand_name, product_name, tire_size_full, width, ratio, diameter, load_index, speed_index, tube_type, position_type, product_image_url, product_url, seller_name, price",
    )
    .in("tire_product_id", tireProductIds)
    .eq("is_active", true)
    .order("brand_name", { ascending: true })
    .order("product_name", { ascending: true })
    .order("tire_product_id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TireProductRow[];
}
