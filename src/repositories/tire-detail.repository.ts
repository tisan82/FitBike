import { createServerSupabaseClient } from "@/lib/supabase/server";

export type TireProductDetailRow = {
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

export async function findActiveTireProductById(
  tireProductId: number,
): Promise<TireProductDetailRow | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("04_tire_product")
    .select(
      "tire_product_id, tire_product_key, brand_name, product_name, tire_size_full, width, ratio, diameter, load_index, speed_index, tube_type, position_type, product_image_url, product_url, seller_name, price",
    )
    .eq("tire_product_id", tireProductId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as TireProductDetailRow | null;
}
