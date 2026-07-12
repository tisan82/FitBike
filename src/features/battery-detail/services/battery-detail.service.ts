import type {
  ApiResponse,
  BatteryProductDetail,
} from "@/features/battery-detail/types/battery-detail.types";

export async function getBatteryProductDetail(
  batteryProductId: number,
): Promise<BatteryProductDetail> {
  const response = await fetch(`/api/v1/battery-products/${batteryProductId}`, {
    headers: { Accept: "application/json" },
  });
  const body = (await response.json()) as ApiResponse<BatteryProductDetail>;

  if (!response.ok || !body.success) {
    const message = body.success
      ? "배터리 상품 정보를 불러오지 못했습니다."
      : body.error.message;
    throw new Error(message);
  }

  return body.data;
}
