import { createServerSupabaseClient } from "@/lib/supabase/server";
export async function findActiveModelYearsForSitemap() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("03_bike_model_year").select("bike_model_year_id, updated_at").eq("is_active", true).order("bike_model_year_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ bike_model_year_id: number; updated_at: string }>;
}
