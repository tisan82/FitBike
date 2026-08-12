import type {
  ApiResponse,
  ModelDetailData,
  ModelDetailProductsData,
} from "@/features/model-detail/types/model-detail.types";

export async function getModelDetail(
  bikeModelYearId: number,
): Promise<ModelDetailData> {
  const response = await fetch(`/api/v1/model-details/${bikeModelYearId}`);
  const result = (await response.json()) as ApiResponse<ModelDetailData>;

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data;
}

export async function getModelDetailProducts(bikeModelYearId: number): Promise<ModelDetailProductsData> {
  const response = await fetch(`/api/v1/model-details/${bikeModelYearId}/products`);
  const result = (await response.json()) as ApiResponse<ModelDetailProductsData>;
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}
