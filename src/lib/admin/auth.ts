import { createContentFactorySupabaseClient } from "@/lib/supabase/content-factory";

export type AdminIdentity = { id: string; email: string };

function configuredAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export async function verifyAdminRequest(request: Request): Promise<AdminIdentity | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length);
  const { data, error } = await createContentFactorySupabaseClient().auth.getUser(token);
  const email = data.user?.email?.toLowerCase();
  if (error || !data.user || !email || !configuredAdminEmails().includes(email)) return null;
  return { id: data.user.id, email };
}

export function hasConfiguredAdmins() {
  return configuredAdminEmails().length > 0;
}
