import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ModelYearDetailRow = {
  bike_model_year_id: number;
  bike_model_id: number;
  generation_key: string | null;
  market_code: string;
  year_range_label: string;
  start_year: number;
  end_year: number | null;
  generation_name: string | null;
  frame_code: string | null;
  trim_name: string | null;
  variant_name: string | null;
  category_override: string | null;
  engine_cc_override: number | null;
  generation_image_url: string | null;
  front_tire_full_size: string | null;
  front_tire_width: number | null;
  front_tire_ratio: number | null;
  front_tire_diameter: number | null;
  front_tire_load_index: number | null;
  front_tire_speed_index: string | null;
  front_tire_tube_type: string | null;
  rear_tire_full_size: string | null;
  rear_tire_width: number | null;
  rear_tire_ratio: number | null;
  rear_tire_diameter: number | null;
  rear_tire_load_index: number | null;
  rear_tire_speed_index: string | null;
  rear_tire_tube_type: string | null;
  battery_standard_code: string | null;
  battery_voltage: string | null;
  front_brake_spec: string | null;
  front_brake_caliper_type: string | null;
  rear_brake_spec: string | null;
  rear_brake_caliper_type: string | null;
  major_changes: string | null;
  model_features: string | null;
};

export type ModelDetailRow = {
  bike_model_id: number;
  brand_id: number;
  model_key: string;
  model_name_en: string;
  model_name_ko: string | null;
  default_category: string | null;
  engine_cc: number | null;
  model_summary: string | null;
  model_image_url: string | null;
};

export type BrandDetailRow = {
  brand_id: number;
  brand_en: string;
  brand_ko: string | null;
  brand_summary: string | null;
};

export async function findModelYearDetail(
  bikeModelYearId: number,
): Promise<ModelYearDetailRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("03_bike_model_year")
    .select(
      "bike_model_year_id, bike_model_id, generation_key, market_code, year_range_label, start_year, end_year, generation_name, frame_code, trim_name, variant_name, category_override, engine_cc_override, generation_image_url, front_tire_full_size, front_tire_width, front_tire_ratio, front_tire_diameter, front_tire_load_index, front_tire_speed_index, front_tire_tube_type, rear_tire_full_size, rear_tire_width, rear_tire_ratio, rear_tire_diameter, rear_tire_load_index, rear_tire_speed_index, rear_tire_tube_type, battery_standard_code, battery_voltage, front_brake_spec, front_brake_caliper_type, rear_brake_spec, rear_brake_caliper_type, major_changes, model_features",
    )
    .eq("bike_model_year_id", bikeModelYearId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ModelYearDetailRow | null;
}

export async function findModelDetail(
  bikeModelId: number,
): Promise<ModelDetailRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("02_bike_model")
    .select(
      "bike_model_id, brand_id, model_key, model_name_en, model_name_ko, default_category, engine_cc, model_summary, model_image_url",
    )
    .eq("bike_model_id", bikeModelId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ModelDetailRow | null;
}

export async function findBrandDetail(
  brandId: number,
): Promise<BrandDetailRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("01_brand")
    .select("brand_id, brand_en, brand_ko, brand_summary")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BrandDetailRow | null;
}
