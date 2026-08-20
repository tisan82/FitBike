"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getTireProductFitments } from "@/features/tire-detail/services/tire-detail.service";
import type { TireProductFitment } from "@/features/tire-detail/types/tire-detail.types";
import { getTirePositionLabel } from "@/features/tire-detail/utils/tire-position";

const INITIAL_BRAND_ROWS = 8;

type BrandGroup = {
  brandName: string;
  fitments: TireProductFitment[];
};

export function TireFitmentList({
  tireProductId,
  fitmentCount,
}: {
  tireProductId: number;
  fitmentCount: number;
}) {
  const [fitments, setFitments] = useState<TireProductFitment[] | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fitmentCount === 0) return;
    let active = true;
    getTireProductFitments(tireProductId)
      .then((data) => {
        if (active) setFitments(data);
      })
      .catch(() => {
        if (active) setError("장착 가능한 바이크 정보를 불러오지 못했습니다.");
      });
    return () => {
      active = false;
    };
  }, [fitmentCount, tireProductId]);

  const brandGroups = useMemo<BrandGroup[]>(() => {
    if (!fitments) return [];
    const grouped = new Map<string, TireProductFitment[]>();
    for (const fitment of fitments) {
      const items = grouped.get(fitment.brandName) ?? [];
      items.push(fitment);
      grouped.set(fitment.brandName, items);
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right, ["ko", "en"]))
      .map(([brandName, items]) => ({ brandName, fitments: items }));
  }, [fitments]);

  if (fitmentCount === 0) return null;
  const activeBrand = selectedBrand ?? brandGroups[0]?.brandName ?? null;
  const activeGroup = brandGroups.find((group) => group.brandName === activeBrand);
  const visibleFitments = expanded
    ? activeGroup?.fitments
    : activeGroup?.fitments.slice(0, INITIAL_BRAND_ROWS);

  return (
    <section aria-labelledby="tire-fitments-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold text-foreground" id="tire-fitments-title">
          장착 가능한 바이크 <span className="text-primary">{fitments?.length ?? fitmentCount}</span>
        </h2>
      </div>
      <p className="mt-2 text-base text-foreground-secondary">
        제조사를 선택해 FitBike에 연결된 모델과 연식을 확인하세요.
      </p>

      {!fitments && !error ? <p className="mt-4 text-sm text-foreground-secondary">장착 정보를 불러오는 중입니다.</p> : null}
      {error ? <p className="mt-4 text-sm text-foreground-secondary">{error}</p> : null}

      {brandGroups.length ? (
        <>
          <div
            aria-label="바이크 제조사 선택"
            className="-mx-4 mt-4 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
          >
            {brandGroups.map((group) => {
              const selected = group.brandName === activeBrand;
              return (
                <button
                  aria-controls="selected-fitment-brand"
                  aria-selected={selected}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-semibold ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground"}`}
                  key={group.brandName}
                  onClick={() => {
                    setSelectedBrand(group.brandName);
                    setExpanded(false);
                  }}
                  role="tab"
                  type="button"
                >
                  {group.brandName}
                  <span className={selected ? "text-primary-foreground/80" : "text-foreground-secondary"}>
                    {group.fitments.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-2" id="selected-fitment-brand" role="tabpanel">
            <p className="py-3 text-sm font-semibold text-foreground-secondary">{activeBrand}</p>
            <ul className="divide-y divide-border border-y border-border">
              {visibleFitments?.map((fitment) => (
                <li key={`${fitment.bikeModelYearId}-${fitment.position}`}>
                  <Link
                    className="grid min-h-11 gap-1 py-3 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    href={`/model-detail/${fitment.bikeModelYearId}`}
                  >
                    <span className="text-base font-semibold">{fitment.modelName}</span>
                    <span className="text-sm text-foreground-secondary sm:text-right">
                      {fitment.yearRangeLabel} · {getTirePositionLabel(fitment.position)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {activeGroup && activeGroup.fitments.length > INITIAL_BRAND_ROWS ? (
              <button
                aria-expanded={expanded}
                className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                onClick={() => setExpanded((value) => !value)}
                type="button"
              >
                {expanded ? `${activeBrand} 모델 접기` : `${activeBrand} 모델 전체 보기 (${activeGroup.fitments.length})`}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
