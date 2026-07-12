import { errorResponse, successResponse } from "@/lib/api/response";
import { getBrandOptions } from "@/services/bike-selector.service";

export async function GET() {
  try {
    return successResponse(await getBrandOptions());
  } catch (error) {
    console.error("Failed to load brands", error);
    return errorResponse("INTERNAL_ERROR", "브랜드를 불러오지 못했습니다.", 500);
  }
}
