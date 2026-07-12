import type {
  ApiResponse,
  FitmentResultData,
} from "@/features/fitment-result/types/fitment-result.types";

export async function getFitmentResult(
  bikeModelYearId: number,
): Promise<FitmentResultData> {
  const response = await fetch(`/api/v1/fitment-results/${bikeModelYearId}`, {
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as ApiResponse<FitmentResultData>;

  if (!response.ok || !body.success) {
    const message = body.success
      ? "장착 가능 상품 정보를 불러오지 못했습니다."
      : body.error.message;
    throw new Error(message);
  }

  return body.data;
}
