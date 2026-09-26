"use client";

import { useQuery } from "@tanstack/react-query";

import { getBatteryProductDetail } from "@/features/battery-detail/services/battery-detail.service";
import type { BatteryProductDetail } from "@/features/battery-detail/types/battery-detail.types";

export function useBatteryDetailQuery(
  batteryProductId: number | null,
  initialData?: BatteryProductDetail,
) {
  return useQuery({
    queryKey: ["battery-product-detail", batteryProductId],
    queryFn: () => getBatteryProductDetail(batteryProductId as number),
    enabled: batteryProductId !== null,
    initialData,
  });
}
