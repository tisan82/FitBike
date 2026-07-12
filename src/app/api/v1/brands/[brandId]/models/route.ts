import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api/response";
import { getModelOptionsByBrand } from "@/services/bike-selector.service";

const paramsSchema = z.object({ brandId: z.coerce.number().int().positive() });

type RouteContext = { params: Promise<{ brandId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", "올바른 브랜드 ID가 필요합니다.", 422);
  }

  try {
    return successResponse(await getModelOptionsByBrand(parsed.data.brandId));
  } catch (error) {
    console.error("Failed to load models", error);
    return errorResponse("INTERNAL_ERROR", "모델을 불러오지 못했습니다.", 500);
  }
}
