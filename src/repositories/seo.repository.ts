import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function findActiveModelYearsForSitemap() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("03_bike_model_year")
    .select("bike_model_year_id, updated_at")
    .eq("is_active", true)
    .order("bike_model_year_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ bike_model_year_id: number; updated_at: string }>;
}

export async function findPublishedContentsForSitemap() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("12_content")
    .select("content_key, updated_at")
    .eq("is_active", true)
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("content_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ content_key: string; updated_at: string }>;
}

export async function findActiveTireProductsForSitemap() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("04_tire_product")
    .select("tire_product_id, updated_at")
    .eq("is_active", true)
    .order("tire_product_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ tire_product_id: number; updated_at: string }>;
}

export async function findActiveTireModelsForSitemap() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("11_tire_model")
    .select("tire_model_key, updated_at")
    .eq("is_active", true)
    .order("tire_model_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ tire_model_key: string; updated_at: string }>;
}

export async function findActiveBatteryProductsForSitemap() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("05_battery_product")
    .select("battery_product_id, updated_at")
    .eq("is_active", true)
    .order("battery_product_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ battery_product_id: number; updated_at: string }>;
}
