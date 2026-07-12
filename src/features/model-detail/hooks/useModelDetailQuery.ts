"use client";

import { useQuery } from "@tanstack/react-query";

import { getModelDetail } from "@/features/model-detail/services/model-detail.service";

export function useModelDetailQuery(bikeModelYearId: number | null) {
  return useQuery({
    queryKey: ["model-detail", bikeModelYearId],
    queryFn: () => getModelDetail(bikeModelYearId as number),
    enabled: bikeModelYearId !== null,
  });
}
