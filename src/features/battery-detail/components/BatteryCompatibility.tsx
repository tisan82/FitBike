"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { CompatibleBatteryModel } from "@/features/battery-detail/types/battery-detail.types";

const ALL_BRANDS = "전체";

export function BatteryCompatibility({ models }: { models: CompatibleBatteryModel[] }) {
  const [selectedBrand, setSelectedBrand] = useState(ALL_BRANDS);

  const brands = useMemo(
    () => Array.from(new Set(models.map((model) => model.brandName))).sort((a, b) => a.localeCompare(b, "ko")),
    [models],
  );

  const filteredModels = useMemo(
    () => selectedBrand === ALL_BRANDS ? models : models.filter((model) => model.brandName === selectedBrand),
    [models, selectedBrand],
  );

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

  const visible = filteredModels.slice(0, 24);

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

      <div className="-mx-1 mt-5 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" aria-label="오토바이 브랜드 필터">
        {[ALL_BRANDS, ...brands].map((brand) => {
          const selected = selectedBrand === brand;
          const count = brand === ALL_BRANDS ? models.length : models.filter((model) => model.brandName === brand).length;
          return (
            <button
              aria-pressed={selected}
              className={`min-h-11 flex-none snap-start rounded-full border px-4 text-sm font-bold transition ${selected ? "border-primary bg-selected-background text-primary" : "border-border bg-surface text-foreground-secondary hover:border-primary"}`}
              key={brand}
              onClick={() => setSelectedBrand(brand)}
              type="button"
            >
              {brand} <span className="font-medium">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground-secondary">
          {selectedBrand === ALL_BRANDS ? "전체 브랜드" : selectedBrand} · {filteredModels.length}개
        </p>
        {selectedBrand !== ALL_BRANDS ? (
          <button className="min-h-11 px-2 text-sm font-bold text-primary" onClick={() => setSelectedBrand(ALL_BRANDS)} type="button">
            전체 보기
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
        {visible.map((model) => (
          <Link
            className="flex min-h-24 min-w-0 items-center justify-between rounded-xl border border-border px-3 py-3 transition hover:border-primary sm:px-4"
            href={`/model-detail/${model.bikeModelYearId}`}
            key={model.bikeModelYearId}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-foreground-secondary sm:text-sm">{model.brandName}</span>
              <span className="mt-0.5 block line-clamp-2 text-sm font-bold leading-5 sm:text-base">{model.modelName}</span>
              <span className="mt-1 block text-xs text-foreground-secondary sm:text-sm">{model.yearRangeLabel}</span>
            </span>
            <span aria-hidden className="ml-2 flex-none text-primary">›</span>
          </Link>
        ))}
      </div>
      {filteredModels.length > visible.length ? (
        <p className="mt-4 text-sm text-foreground-secondary">외 {filteredModels.length - visible.length}개 모델이 더 연결되어 있습니다.</p>
      ) : null}
    </section>
  );
}
