"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

import { BikeSelectorSubmit } from "@/features/bike-selector/components/BikeSelectorSubmit";
import { BrandSelect } from "@/features/bike-selector/components/BrandSelect";
import { ModelSelect } from "@/features/bike-selector/components/ModelSelect";
import { YearSelect } from "@/features/bike-selector/components/YearSelect";
import { useBikeSelector } from "@/features/bike-selector/hooks/useBikeSelector";
import {
  useBrandOptionsQuery,
  useModelOptionsQuery,
  useYearOptionsQuery,
} from "@/features/bike-selector/hooks/useBikeSelectorQueries";

export function BikeSelector() {
  const router = useRouter();
  const selector = useBikeSelector();
  const brands = useBrandOptionsQuery();
  const models = useModelOptionsQuery(selector.selectedBrandId);
  const years = useYearOptionsQuery(selector.selectedModelId);
  const error = brands.error ?? models.error ?? years.error;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selector.selectedModelYearId) return;
    router.push(`/fitment-result?bikeModelYearId=${selector.selectedModelYearId}`);
  };

  return (
    <main className="mx-auto w-full max-w-xl px-5 py-10 sm:py-16">
      <header className="mb-8 space-y-3">
        <p className="text-sm font-semibold text-zinc-500">BIKE SELECTOR</p>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-950">내 바이크를 선택하세요</h1>
        <p className="text-base leading-7 text-zinc-600">브랜드, 모델, 연식을 선택하면 장착 가능한 부품 정보를 확인할 수 있습니다.</p>
      </header>

      <form className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7" onSubmit={handleSubmit}>
        <BrandSelect brands={brands.data ?? []} value={selector.selectedBrandId} loading={brands.isLoading} onChange={selector.selectBrand} />
        <ModelSelect models={models.data ?? []} value={selector.selectedModelId} disabled={selector.selectedBrandId === null} loading={models.isFetching} onChange={selector.selectModel} />
        <YearSelect years={years.data ?? []} value={selector.selectedModelYearId} disabled={selector.selectedModelId === null} loading={years.isFetching} onChange={selector.selectModelYear} />

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {error instanceof Error ? error.message : "데이터를 불러오지 못했습니다."}
          </div>
        ) : null}

        <BikeSelectorSubmit disabled={!selector.canSubmit} />
      </form>
    </main>
  );
}
