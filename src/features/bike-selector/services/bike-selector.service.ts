import type {
  ApiResponse,
  BrandOption,
  ModelOption,
  YearOption,
} from "@/features/bike-selector/types/bike-selector.types";

async function requestOptions<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !body.success) {
    const message = body.success ? "데이터를 불러오지 못했습니다." : body.error.message;
    throw new Error(message);
  }

  return body.data;
}

export function getBrandOptions() {
  return requestOptions<BrandOption[]>("/api/v1/brands");
}

export function getModelOptionsByBrand(brandId: number) {
  return requestOptions<ModelOption[]>(`/api/v1/brands/${brandId}/models`);
}

export function getYearOptionsByModel(modelId: number) {
  return requestOptions<YearOption[]>(`/api/v1/models/${modelId}/years`);
}
