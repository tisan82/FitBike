import { createServerSupabaseClient } from "@/lib/supabase/server";
export async function findActiveModelYearsForSitemap() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("03_bike_model_year").select("bike_model_year_id, updated_at").eq("is_active", true).order("bike_model_year_id", { ascending: true });
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
