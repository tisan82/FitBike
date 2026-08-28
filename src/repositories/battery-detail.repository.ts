import { createServerSupabaseClient } from "@/lib/supabase/server";

export type BatteryProductDetailRow = {
  battery_product_id: number;
  battery_part_key: string;
  brand_name: string;
  spec_code: string;
  voltage: string | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  weight_kg: number | null;
  capacity_ah: number | null;
  watt_hour: number | null;
  internal_resistance_mohm: number | null;
  continuous_discharge_cca: number | null;
  max_discharge_cca: number | null;
  battery_type: string | null;
  terminal_polarity: string | null;
  terminal_type: string | null;
  product_image_url: string | null;
  product_url: string | null;
  seller_name: string | null;
  price: number | null;
};

export type CompatibleBatteryModelRow = {
  bike_model_year_id: number;
  bike_model_id: number;
  year_range_label: string;
  model_name_en: string;
  model_name_ko: string | null;
  brand_en: string;
  brand_ko: string | null;
};

export async function findActiveBatteryProductById(
  batteryProductId: number,
): Promise<BatteryProductDetailRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("05_battery_product")
    .select(
      "battery_product_id, battery_part_key, brand_name, spec_code, voltage, length_mm, width_mm, height_mm, weight_kg, capacity_ah, watt_hour, internal_resistance_mohm, continuous_discharge_cca, max_discharge_cca, battery_type, terminal_polarity, terminal_type, product_image_url, product_url, seller_name, price",
    )
    .eq("battery_product_id", batteryProductId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as BatteryProductDetailRow | null;
}

export async function findCompatibleModelsByBatteryProductId(
  batteryProductId: number,
): Promise<CompatibleBatteryModelRow[]> {
  const supabase = createServerSupabaseClient();

  const { data: mappings, error: mappingError } = await supabase
    .from("08_battery_standard_product")
    .select("battery_standard_code")
    .eq("battery_product_id", batteryProductId)
    .eq("is_active", true);

  if (mappingError) throw new Error(mappingError.message);
  const codes = Array.from(new Set((mappings ?? []).map((item) => item.battery_standard_code).filter(Boolean)));
  if (!codes.length) return [];

  const { data: modelYears, error: yearError } = await supabase
    .from("03_bike_model_year")
    .select("bike_model_year_id, bike_model_id, year_range_label")
    .in("battery_standard_code", codes)
    .eq("is_active", true)
    .order("start_year", { ascending: false });

  if (yearError) throw new Error(yearError.message);
  const bikeModelIds = Array.from(new Set((modelYears ?? []).map((item) => item.bike_model_id)));
  if (!bikeModelIds.length) return [];

  const { data: models, error: modelError } = await supabase
    .from("02_bike_model")
    .select("bike_model_id, brand_id, model_name_en, model_name_ko")
    .in("bike_model_id", bikeModelIds)
    .eq("is_active", true);

  if (modelError) throw new Error(modelError.message);
  const brandIds = Array.from(new Set((models ?? []).map((item) => item.brand_id)));

  const { data: brands, error: brandError } = await supabase
    .from("01_brand")
    .select("brand_id, brand_en, brand_ko")
    .in("brand_id", brandIds)
    .eq("is_active", true);

  if (brandError) throw new Error(brandError.message);

  const modelMap = new Map((models ?? []).map((item) => [item.bike_model_id, item]));
  const brandMap = new Map((brands ?? []).map((item) => [item.brand_id, item]));

  return (modelYears ?? []).flatMap((year) => {
    const model = modelMap.get(year.bike_model_id);
    if (!model) return [];
    const brand = brandMap.get(model.brand_id);
    if (!brand) return [];
    return [{
      bike_model_year_id: year.bike_model_year_id,
      bike_model_id: year.bike_model_id,
      year_range_label: year.year_range_label,
      model_name_en: model.model_name_en,
      model_name_ko: model.model_name_ko,
      brand_en: brand.brand_en,
      brand_ko: brand.brand_ko,
    }];
  });
}
