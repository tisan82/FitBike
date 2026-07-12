import type {
  ApiResponse,
  TireProductDetail,
} from "@/features/tire-detail/types/tire-detail.types";

export async function getTireProductDetail(
  tireProductId: number,
): Promise<TireProductDetail> {
  const response = await fetch(`/api/v1/tire-products/${tireProductId}`, {
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as ApiResponse<TireProductDetail>;

  if (!response.ok || !body.success) {
    const message = body.success
      ? "타이어 상품 정보를 불러오지 못했습니다."
      : body.error.message;
    throw new Error(message);
  }

  return body.data;
}
