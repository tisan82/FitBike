import { z } from "zod";

import { requireAdmin } from "@/app/api/internal/admin/_shared";
import { errorResponse, successResponse } from "@/lib/api/response";
import { queueUpdateSchema } from "@/lib/content-factory/schemas";
import { transitionAdminOperationsTopic } from "@/services/admin-operations.service";

export const runtime = "nodejs";
const paramsSchema = z.object({ topicKey: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) });

export async function PATCH(request: Request, context: { params: Promise<{ topicKey: string }> }) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  const [params, body] = await Promise.all([
    paramsSchema.safeParseAsync(await context.params),
    request.json().then((value) => queueUpdateSchema.safeParseAsync(value)).catch(() => null),
  ]);
  if (!params.success || !body?.success) return errorResponse("VALIDATION_ERROR", "상태 변경 요청이 올바르지 않습니다.", 422);
  try {
    return successResponse(await transitionAdminOperationsTopic(params.data.topicKey, body.data));
  } catch (error) {
    console.error("Admin topic transition failed", error);
    return errorResponse("TOPIC_STATE_CONFLICT", "Topic 상태가 변경되었거나 전환할 수 없습니다.", 409);
  }
}
