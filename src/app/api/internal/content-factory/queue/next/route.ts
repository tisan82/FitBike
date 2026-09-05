import { contentFactoryAuthError, noStoreHeaders } from "@/app/api/internal/content-factory/_shared";
import { errorResponse } from "@/lib/api/response";
import { getNextContentFactoryTopic } from "@/services/content-factory.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authError = contentFactoryAuthError(request);
  if (authError) return authError;
  try {
    return Response.json({ success: true, data: await getNextContentFactoryTopic() }, { headers: noStoreHeaders() });
  } catch (error) {
    console.error("Content Factory queue read failed", error);
    return errorResponse("INTERNAL_ERROR", "콘텐츠 큐를 불러오지 못했습니다.", 500);
  }
}
