"use client";

import { useQuery } from "@tanstack/react-query";

import { getTireProductDetail } from "@/features/tire-detail/services/tire-detail.service";
import type { TireProductDetail } from "@/features/tire-detail/types/tire-detail.types";

export function useTireDetailQuery(
  tireProductId: number | null,
  initialData?: TireProductDetail,
) {
  return useQuery({
    queryKey: ["tire-product-detail", tireProductId],
    queryFn: () => getTireProductDetail(tireProductId as number),
    enabled: tireProductId !== null,
    initialData,
  });
}
