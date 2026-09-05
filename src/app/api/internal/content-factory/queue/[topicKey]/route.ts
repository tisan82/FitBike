import { z } from "zod";

import { contentFactoryAuthError } from "@/app/api/internal/content-factory/_shared";
import { errorResponse, successResponse } from "@/lib/api/response";
import { queueUpdateSchema } from "@/lib/content-factory/schemas";
import { transitionContentFactoryTopic } from "@/services/content-factory.service";

export const runtime = "nodejs";
const paramsSchema = z.object({ topicKey: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

export async function PATCH(request: Request, context: { params: Promise<{ topicKey: string }> }) {
  const authError = contentFactoryAuthError(request);
  if (authError) return authError;
  const [params, body] = await Promise.all([
    paramsSchema.safeParseAsync(await context.params),
    request.json().then((value) => queueUpdateSchema.safeParseAsync(value)).catch(() => null),
  ]);
  if (!params.success || !body?.success) return errorResponse("VALIDATION_ERROR", "큐 상태 변경 요청이 올바르지 않습니다.", 422);
  try {
    return successResponse(await transitionContentFactoryTopic(params.data.topicKey, body.data));
  } catch (error) {
    console.error("Content Factory queue update failed", error);
    return errorResponse("CONFLICT", "큐 상태가 변경되었거나 요청한 전환을 적용할 수 없습니다.", 409);
  }
}
