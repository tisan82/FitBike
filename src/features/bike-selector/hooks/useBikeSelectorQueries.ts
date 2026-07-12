import { useQuery } from "@tanstack/react-query";

import {
  getBrandOptions,
  getModelOptionsByBrand,
  getYearOptionsByModel,
} from "@/features/bike-selector/services/bike-selector.service";

export function useBrandOptionsQuery() {
  return useQuery({ queryKey: ["bike-selector", "brands"], queryFn: getBrandOptions });
}

export function useModelOptionsQuery(brandId: number | null) {
  return useQuery({
    queryKey: ["bike-selector", "models", brandId],
    queryFn: () => getModelOptionsByBrand(brandId as number),
    enabled: brandId !== null,
  });
}

export function useYearOptionsQuery(modelId: number | null) {
  return useQuery({
    queryKey: ["bike-selector", "years", modelId],
    queryFn: () => getYearOptionsByModel(modelId as number),
    enabled: modelId !== null,
  });
}
