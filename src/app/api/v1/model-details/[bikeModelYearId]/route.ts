import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api/response";
import {
  getModelDetail,
  ModelDetailNotFoundError,
} from "@/services/model-detail.service";

const paramsSchema = z.object({
  bikeModelYearId: z.coerce.number().int().positive(),
});

type RouteContext = {
  params: Promise<{ bikeModelYearId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const parsed = paramsSchema.safeParse(await context.params);

  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "올바른 모델·연식 ID가 필요합니다.",
      422,
    );
  }

  try {
    return successResponse(await getModelDetail(parsed.data.bikeModelYearId));
  } catch (error) {
    if (error instanceof ModelDetailNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("Failed to load model detail", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "바이크 상세 정보를 불러오지 못했습니다.",
      500,
    );
  }
}
