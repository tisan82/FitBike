"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getModelDetail } from "@/features/model-detail/services/model-detail.service";

export function useModelDetailQuery(bikeModelYearId: number | null, initialData?: import("@/features/model-detail/types/model-detail.types").ModelDetailData) {
  return useQuery({
    queryKey: ["model-detail", bikeModelYearId],
    queryFn: () => getModelDetail(bikeModelYearId as number),
    enabled: bikeModelYearId !== null && initialData === undefined,
    placeholderData: keepPreviousData,
    initialData,
  });
}
