import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api/response";
import {
  getTireProductDetail,
  TireProductNotFoundError,
} from "@/services/tire-detail.service";

const paramsSchema = z.object({
  tireProductId: z.coerce.number().int().positive(),
});

type RouteContext = {
  params: Promise<{ tireProductId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const parsed = paramsSchema.safeParse(await context.params);

  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      "올바른 타이어 상품 ID가 필요합니다.",
      422,
    );
  }

  try {
    return successResponse(await getTireProductDetail(parsed.data.tireProductId));
  } catch (error) {
    if (error instanceof TireProductNotFoundError) {
      return errorResponse("NOT_FOUND", error.message, 404);
    }

    console.error("Failed to load tire product detail", error);
    return errorResponse(
      "INTERNAL_ERROR",
      "타이어 상품 정보를 불러오지 못했습니다.",
      500,
    );
  }
}
