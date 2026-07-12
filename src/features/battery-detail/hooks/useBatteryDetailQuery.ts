"use client";

import { useQuery } from "@tanstack/react-query";

import { getBatteryProductDetail } from "@/features/battery-detail/services/battery-detail.service";

export function useBatteryDetailQuery(batteryProductId: number | null) {
  return useQuery({
    queryKey: ["battery-product-detail", batteryProductId],
    queryFn: () => getBatteryProductDetail(batteryProductId as number),
    enabled: batteryProductId !== null,
  });
}
