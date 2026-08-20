import { createServerSupabaseClient } from "@/lib/supabase/server";

export type TireProductDetailRow = {
  tire_product_id: number;
  tire_model_id: number | null;
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

export type TireModelDetailRow = {
  tire_model_id: number;
  tire_model_key: string;
  brand_name: string;
  model_name: string;
  display_name: string | null;
  summary: string | null;
  description: string | null;
  feature_1_title: string | null;
  feature_1_description: string | null;
  feature_2_title: string | null;
  feature_2_description: string | null;
  feature_3_title: string | null;
  feature_3_description: string | null;
  main_image_url: string | null;
  sub_image_url_1: string | null;
  sub_image_url_2: string | null;
};

export type TireModelProductRow = Pick<
  TireProductDetailRow,
  | "tire_product_id"
  | "tire_product_key"
  | "tire_size_full"
  | "width"
  | "ratio"
  | "diameter"
  | "load_index"
  | "speed_index"
  | "tube_type"
  | "position_type"
  | "product_image_url"
  | "product_url"
  | "price"
>;

export type TireFitmentMappingRow = {
  tire_product_id: number;
  bike_model_year_id: number;
  position_type: "FRONT" | "REAR";
  display_order: number;
};

export type TireFitmentModelYearRow = {
  bike_model_year_id: number;
  bike_model_id: number;
  year_range_label: string;
};

export type TireFitmentModelRow = {
  bike_model_id: number;
  brand_id: number;
  model_name_en: string;
  model_name_ko: string | null;
};

export type TireFitmentBrandRow = {
  brand_id: number;
  brand_en: string;
  brand_ko: string | null;
};

export async function findActiveTireProductById(
  tireProductId: number,
): Promise<TireProductDetailRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("04_tire_product")
    .select(
      "tire_product_id, tire_model_id, tire_product_key, brand_name, product_name, tire_size_full, width, ratio, diameter, load_index, speed_index, tube_type, position_type, product_image_url, product_url, seller_name, price",
    )
    .eq("tire_product_id", tireProductId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as TireProductDetailRow | null;
}

export async function findActiveTireModelById(
  tireModelId: number,
): Promise<TireModelDetailRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("11_tire_model")
    .select(
      "tire_model_id, tire_model_key, brand_name, model_name, display_name, summary, description, feature_1_title, feature_1_description, feature_2_title, feature_2_description, feature_3_title, feature_3_description, main_image_url, sub_image_url_1, sub_image_url_2",
    )
    .eq("tire_model_id", tireModelId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as TireModelDetailRow | null;
}

export async function findActiveTireModelByKey(
  tireModelKey: string,
): Promise<TireModelDetailRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("11_tire_model")
    .select(
      "tire_model_id, tire_model_key, brand_name, model_name, display_name, summary, description, feature_1_title, feature_1_description, feature_2_title, feature_2_description, feature_3_title, feature_3_description, main_image_url, sub_image_url_1, sub_image_url_2",
    )
    .eq("tire_model_key", tireModelKey)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as TireModelDetailRow | null;
}

export async function findActiveTireProductsByModelId(
  tireModelId: number,
): Promise<TireModelProductRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("04_tire_product")
    .select(
      "tire_product_id, tire_product_key, tire_size_full, width, ratio, diameter, load_index, speed_index, tube_type, position_type, product_image_url, product_url, price",
    )
    .eq("tire_model_id", tireModelId)
    .eq("is_active", true)
    .order("diameter", { ascending: true, nullsFirst: false })
    .order("width", { ascending: true, nullsFirst: false })
    .order("ratio", { ascending: true, nullsFirst: false })
    .order("tire_product_id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TireModelProductRow[];
}

export async function findActiveTireFitmentMappings(
  tireProductIds: number[],
): Promise<TireFitmentMappingRow[]> {
  if (tireProductIds.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("07_bike_model_year_tire_product")
    .select(
      "tire_product_id, bike_model_year_id, position_type, display_order",
    )
    .in("tire_product_id", tireProductIds)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TireFitmentMappingRow[];
}

export async function findActiveFitmentModelYears(
  bikeModelYearIds: number[],
): Promise<TireFitmentModelYearRow[]> {
  if (bikeModelYearIds.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("03_bike_model_year")
    .select("bike_model_year_id, bike_model_id, year_range_label")
    .in("bike_model_year_id", bikeModelYearIds)
    .eq("is_active", true);

  if (error) throw new Error(error.message);
  return (data ?? []) as TireFitmentModelYearRow[];
}

export async function findActiveFitmentModels(
  bikeModelIds: number[],
): Promise<TireFitmentModelRow[]> {
  if (bikeModelIds.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("02_bike_model")
    .select("bike_model_id, brand_id, model_name_en, model_name_ko")
    .in("bike_model_id", bikeModelIds)
    .eq("is_active", true);

  if (error) throw new Error(error.message);
  return (data ?? []) as TireFitmentModelRow[];
}

export async function findActiveFitmentBrands(
  brandIds: number[],
): Promise<TireFitmentBrandRow[]> {
  if (brandIds.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("01_brand")
    .select("brand_id, brand_en, brand_ko")
    .in("brand_id", brandIds)
    .eq("is_active", true);

  if (error) throw new Error(error.message);
  return (data ?? []) as TireFitmentBrandRow[];
}
