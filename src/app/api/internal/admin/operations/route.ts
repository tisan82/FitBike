import { requireAdmin } from "@/app/api/internal/admin/_shared";
import { errorResponse } from "@/lib/api/response";
import { getAdminOperationsOverview } from "@/services/admin-operations.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    return Response.json({ success: true, data: await getAdminOperationsOverview() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin operations overview failed", error);
    return errorResponse("INTERNAL_ERROR", "운영 현황을 불러오지 못했습니다.", 500);
  }
}
