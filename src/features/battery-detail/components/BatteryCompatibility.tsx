import Link from "next/link";

import type { CompatibleBatteryModel } from "@/features/battery-detail/types/battery-detail.types";

export function BatteryCompatibility({ models }: { models: CompatibleBatteryModel[] }) {
  if (!models.length) {
    return (
      <section className="rounded-3xl border border-border bg-surface p-5 sm:p-8">
        <h2 className="text-xl font-bold">호환 바이크</h2>
        <p className="mt-3 text-base leading-7 text-foreground-secondary">
          현재 FitBike에 확인된 모델 연결 정보가 없습니다. 구매 전 차량 매뉴얼과 실제 장착 배터리 규격을 함께 확인하세요.
        </p>
      </section>
    );
  }

  const visible = models.slice(0, 24);

  return (
    <section className="rounded-3xl border border-border bg-surface p-5 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-primary">모델 · 연식 기준</p>
          <h2 className="mt-1 text-xl font-bold">호환 바이크 {models.length}개</h2>
        </div>
        <span className="text-sm text-foreground-secondary">FitBike 등록 기준</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-foreground-secondary">
        차량의 배터리 표준 규격과 이 상품의 매핑 정보를 기준으로 연결합니다. 같은 모델명이라도 연식에 따라 규격이 달라질 수 있습니다.
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {visible.map((model) => (
          <Link
            className="flex min-h-16 items-center justify-between rounded-xl border border-border px-4 py-3 transition hover:border-primary"
            href={`/model-detail/${model.bikeModelYearId}`}
            key={model.bikeModelYearId}
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground-secondary">{model.brandName}</span>
              <span className="block truncate font-bold">{model.modelName}</span>
              <span className="block text-sm text-foreground-secondary">{model.yearRangeLabel}</span>
            </span>
            <span aria-hidden className="ml-3 text-primary">›</span>
          </Link>
        ))}
      </div>
      {models.length > visible.length ? (
        <p className="mt-4 text-sm text-foreground-secondary">외 {models.length - visible.length}개 모델이 더 연결되어 있습니다.</p>
      ) : null}
    </section>
  );
}
