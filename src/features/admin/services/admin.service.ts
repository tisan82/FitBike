import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { AdminResourceConfig, AdminRow } from "@/features/admin/types/admin.types";

export async function getAdminSession() {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  return data.session;
}

export async function verifyAdminSession() {
  const session = await getAdminSession();
  if (!session) return null;
  const response = await fetch("/api/internal/admin/session", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return session;
}

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const session = await getAdminSession();
  if (!session) throw new Error("관리자 로그인이 필요합니다.");
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${session.access_token}`);
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? "운영 요청에 실패했습니다.");
  return payload.data as T;
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
