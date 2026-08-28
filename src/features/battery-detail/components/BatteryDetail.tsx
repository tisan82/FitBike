"use client";

import Link from "next/link";

import { BatteryCompatibility } from "@/features/battery-detail/components/BatteryCompatibility";
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

function BatteryPurchaseGuide() {
  return (
    <section className="rounded-3xl border border-border bg-surface p-5 sm:p-8">
      <p className="text-sm font-bold text-primary">구매 전 확인</p>
      <h2 className="mt-1 text-xl font-bold">규격이 맞는지 이 순서로 확인하세요</h2>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          ["1", "차량 모델·연식", "같은 모델도 연식에 따라 배터리 규격이 달라질 수 있습니다."],
          ["2", "표준 규격 코드", "차량 기준 규격과 상품이 대응되는지 먼저 확인합니다."],
          ["3", "크기·단자 방향", "길이·폭·높이와 +/− 단자 위치가 실제 장착 공간과 맞아야 합니다."],
          ["4", "배터리 타입", "리튬·AGM 등 차량과 충전계통에 적합한 타입인지 확인합니다."],
        ].map(([number, title, body]) => (
          <li className="rounded-2xl bg-surface-secondary p-4" key={number}>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{number}</span>
              <strong>{title}</strong>
            </div>
            <p className="mt-3 text-sm leading-6 text-foreground-secondary">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Link className="min-h-12 rounded-xl border border-border px-4 py-3 text-center font-bold text-primary hover:border-primary" href="/contents/motorcycle-battery-fitment-check">
          내 바이크 배터리 확인 방법
        </Link>
        <Link className="min-h-12 rounded-xl border border-border px-4 py-3 text-center font-bold text-primary hover:border-primary" href="/contents/motorcycle-battery-diy-replacement">
          배터리 직접 교체 방법
        </Link>
      </div>
    </section>
  );
}

export function BatteryDetail({ batteryProductId }: Props) {
  const query = useBatteryDetailQuery(batteryProductId);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-5 sm:py-14">
      <BatteryDetailHeader />

      {batteryProductId === null ? <BatteryDetailInvalid /> : null}
      {batteryProductId !== null && query.isLoading ? <BatteryDetailLoading /> : null}
      {batteryProductId !== null && query.error ? (
        <BatteryDetailError
          message={query.error instanceof Error ? query.error.message : "알 수 없는 오류가 발생했습니다."}
        />
      ) : null}

      {query.data ? (
        <div className="space-y-7 sm:space-y-8">
          <BatteryProductSummary product={query.data} />
          <BatteryPurchaseGuide />
          <BatterySpecification product={query.data} />
          <BatteryCompatibility models={query.data.compatibleModels} />
        </div>
      ) : null}
    </main>
  );
}
