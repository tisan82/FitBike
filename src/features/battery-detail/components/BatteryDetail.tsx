"use client";

import { BatteryDetailError } from "@/features/battery-detail/components/BatteryDetailError";
import { BatteryDetailHeader } from "@/features/battery-detail/components/BatteryDetailHeader";
import { BatteryDetailInvalid } from "@/features/battery-detail/components/BatteryDetailInvalid";
import { BatteryDetailLoading } from "@/features/battery-detail/components/BatteryDetailLoading";
import { BatteryProductSummary } from "@/features/battery-detail/components/BatteryProductSummary";
import { BatterySpecification } from "@/features/battery-detail/components/BatterySpecification";
import { useBatteryDetailQuery } from "@/features/battery-detail/hooks/useBatteryDetailQuery";

type Props = {
  batteryProductId: number | null;
};

export function BatteryDetail({ batteryProductId }: Props) {
  const query = useBatteryDetailQuery(batteryProductId);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-5 py-10 sm:py-16">
      <BatteryDetailHeader />

      {batteryProductId === null ? <BatteryDetailInvalid /> : null}
      {batteryProductId !== null && query.isLoading ? (
        <BatteryDetailLoading />
      ) : null}
      {batteryProductId !== null && query.error ? (
        <BatteryDetailError
          message={
            query.error instanceof Error
              ? query.error.message
              : "알 수 없는 오류가 발생했습니다."
          }
        />
      ) : null}

      {query.data ? (
        <div className="space-y-8">
          <BatteryProductSummary product={query.data} />
          <BatterySpecification product={query.data} />
        </div>
      ) : null}
    </main>
  );
}
