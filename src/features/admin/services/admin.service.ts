import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AdminResourceConfig, AdminRow } from "@/features/admin/types/admin.types";

export async function getAdminSession() {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

export async function signInAdmin(email: string, password: string) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.session;
}

export async function signOutAdmin() {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export function isAllowedAdmin(email: string | undefined | null) {
  const configured = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "";
  const allowed = configured.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export async function listResource(config: AdminResourceConfig, search: string): Promise<AdminRow[]> {
  const supabase = createBrowserSupabaseClient();
  let query = supabase.from(config.table).select("*").order(config.primaryKey, { ascending: false }).limit(100);
  if (search.trim() && config.searchColumns.length) {
    query = query.or(config.searchColumns.map((column) => `${column}.ilike.%${search.trim()}%`).join(","));
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminRow[];
}

export async function saveResource(config: AdminResourceConfig, values: AdminRow) {
  const supabase = createBrowserSupabaseClient();
  const id = values[config.primaryKey];
  const payload = Object.fromEntries(Object.entries(values).filter(([key]) => key !== config.primaryKey));
  const result = id
    ? await supabase.from(config.table).update(payload).eq(config.primaryKey, id).select().single()
    : await supabase.from(config.table).insert(payload).select().single();
  if (result.error) throw new Error(result.error.message);
  return result.data as AdminRow;
}

export async function deactivateResource(config: AdminResourceConfig, row: AdminRow) {
  const supabase = createBrowserSupabaseClient();
  const id = row[config.primaryKey];
  if (id === null || id === undefined) throw new Error("식별자가 없습니다.");
  const { error } = await supabase.from(config.table).update({ is_active: false }).eq(config.primaryKey, id);
  if (error) throw new Error(error.message);
}
