import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api/response";
import { getYearOptionsByModel } from "@/services/bike-selector.service";

const paramsSchema = z.object({ modelId: z.coerce.number().int().positive() });

type RouteContext = { params: Promise<{ modelId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "올바른 모델 ID가 필요합니다.", 422);
  }

  try {
    return successResponse(await getYearOptionsByModel(parsed.data.modelId));
  } catch (error) {
    console.error("Failed to load model years", error);
    return errorResponse("INTERNAL_ERROR", "연식을 불러오지 못했습니다.", 500);
  }
}
