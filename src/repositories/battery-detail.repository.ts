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
