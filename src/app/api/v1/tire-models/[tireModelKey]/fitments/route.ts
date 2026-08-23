import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api/response";
import {
  getTireModelCompatibleBikes,
  TireModelNotFoundError,
} from "@/services/tire-detail.service";

const paramsSchema = z.object({
  tireModelKey: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
});
const querySchema = z.object({
  tireProductId: z.coerce.number().int().positive().optional(),
});

type RouteContext = {
  params: Promise<{ tireModelKey: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const parsed = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success || !query.success) {
    return errorResponse("VALIDATION_ERROR", "올바른 타이어 모델 키가 필요합니다.", 422);
  }

  try {
    return successResponse(
      await getTireModelCompatibleBikes(
        parsed.data.tireModelKey,
        query.data.tireProductId,
      ),
    );
  } catch (error) {
    if (error instanceof TireModelNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }
    console.error("Failed to load tire model fitments", error);
    return errorResponse("INTERNAL_ERROR", "호환 바이크를 불러오지 못했습니다.", 500);
  }
}
