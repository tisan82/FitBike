"use client";

import { useQuery } from "@tanstack/react-query";

import { getFitmentResult } from "@/features/fitment-result/services/fitment-result.service";

export function useFitmentResultQuery(bikeModelYearId: number | null) {
  return useQuery({
    queryKey: ["fitment-result", bikeModelYearId],
    queryFn: () => getFitmentResult(bikeModelYearId as number),
    enabled: bikeModelYearId !== null,
  });
}
