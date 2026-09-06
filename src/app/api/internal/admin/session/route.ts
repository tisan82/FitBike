import { requireAdmin } from "@/app/api/internal/admin/_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  return Response.json({ success: true, data: auth.identity }, { headers: { "Cache-Control": "no-store" } });
}
