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

export type ModelYearOptionRow = Pick<
  ModelYearDetailRow,
  "bike_model_year_id" | "bike_model_id" | "year_range_label" | "start_year" | "end_year"
>;

export type ProductMappingRow = {
  id: number;
  position_type?: "FRONT" | "REAR";
  display_order: number;
  tire_product_id?: number;
  battery_product_id?: number;
  brake_product_id?: number;
};

export type ProductRow = {
  tire_product_id?: number;
  battery_product_id?: number;
  brake_product_id?: number;
  brand_name: string;
  product_name?: string;
  tire_size_full?: string | null;
  load_index?: number | null;
  speed_index?: string | null;
  tube_type?: string | null;
  spec_code?: string;
  voltage?: string | null;
  capacity_ah?: number | null;
  battery_type?: string | null;
  brake_type?: string | null;
  compatible_code?: string | null;
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

export async function findModelYearOptions(bikeModelId: number): Promise<ModelYearOptionRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("03_bike_model_year")
    .select("bike_model_year_id, bike_model_id, year_range_label, start_year, end_year")
    .eq("bike_model_id", bikeModelId)
    .eq("is_active", true)
    .order("start_year", { ascending: false })
    .order("bike_model_year_id", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ModelYearOptionRow[];
}

export async function findPrimaryModelYearImage(bikeModelYearId: number): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("10_bike_model_year_image")
    .select("image_storage_path")
    .eq("bike_model_year_id", bikeModelYearId)
    .eq("image_type", "MAIN")
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("display_order", { ascending: true })
    .order("image_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.image_storage_path ?? null;
}

async function findMappings(table: string, select: string, column: string, value: number | string) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from(table).select(select).eq(column, value).eq("is_active", true).order("display_order", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProductMappingRow[];
}

async function findProducts(table: string, select: string, idColumn: string, ids: number[]) {
  if (ids.length === 0) return [];
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from(table).select(select).in(idColumn, ids).eq("is_active", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProductRow[];
}

export const findTireMappings = (id: number) => findMappings("07_bike_model_year_tire_product", "id, tire_product_id, position_type, display_order", "bike_model_year_id", id);
export const findBatteryMappings = (code: string) => findMappings("08_battery_standard_product", "id, battery_product_id, display_order", "battery_standard_code", code);
export const findBrakeMappings = (id: number) => findMappings("09_bike_model_year_brake_product", "id, brake_product_id, position_type, display_order", "bike_model_year_id", id);
export const findTireProducts = (ids: number[]) => findProducts("04_tire_product", "tire_product_id, brand_name, product_name, tire_size_full, load_index, speed_index, tube_type", "tire_product_id", ids);
export const findBatteryProducts = (ids: number[]) => findProducts("05_battery_product", "battery_product_id, brand_name, spec_code, voltage, capacity_ah, battery_type", "battery_product_id", ids);
export const findBrakeProducts = (ids: number[]) => findProducts("06_brake_product", "brake_product_id, brand_name, product_name, brake_type, compatible_code", "brake_product_id", ids);
