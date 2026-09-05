import { contentFactoryAuthError } from "@/app/api/internal/content-factory/_shared";
import { errorResponse, successResponse } from "@/lib/api/response";
import { publishRequestSchema } from "@/lib/content-factory/schemas";
import { ContentFactoryValidationError, publishContentFactory } from "@/services/content-factory.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authError = contentFactoryAuthError(request);
  if (authError) return authError;
  const payload = await request.json().then((value) => publishRequestSchema.safeParseAsync(value)).catch(() => null);
  if (!payload?.success) return errorResponse("VALIDATION_ERROR", "게시 요청이 올바르지 않습니다.", 422);
  try {
    return successResponse(await publishContentFactory(payload.data), 201);
  } catch (error) {
    if (error instanceof ContentFactoryValidationError) return errorResponse("VALIDATION_ERROR", error.message, 422);
    console.error("Content Factory publish failed", error);
    return errorResponse("PUBLISH_CONFLICT", "게시 조건 또는 큐 상태를 확인해 주세요.", 409);
  }
}
