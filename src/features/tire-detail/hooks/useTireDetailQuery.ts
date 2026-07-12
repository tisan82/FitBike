"use client";

import { useQuery } from "@tanstack/react-query";

import { getTireProductDetail } from "@/features/tire-detail/services/tire-detail.service";

export function useTireDetailQuery(tireProductId: number | null) {
  return useQuery({
    queryKey: ["tire-product-detail", tireProductId],
    queryFn: () => getTireProductDetail(tireProductId as number),
    enabled: tireProductId !== null,
  });
}
