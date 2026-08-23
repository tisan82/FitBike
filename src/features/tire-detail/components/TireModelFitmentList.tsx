"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getTireModelCompatibleBikes } from "@/features/tire-detail/services/tire-detail.service";
import type { TireModelCompatibleBike } from "@/features/tire-detail/types/tire-detail.types";

const INITIAL_ROWS = 8;

function getSupplementaryLabel(bike: TireModelCompatibleBike) {
  return [bike.generationName, bike.trimName, bike.variantName]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
}

export function TireModelFitmentList({
  tireModelKey,
  tireProductId,
}: {
  tireModelKey: string;
  tireProductId: number;
}) {
  const [bikes, setBikes] = useState<TireModelCompatibleBike[] | null>(null);
  const [selectedBrand, setSelectedBrand] = useState("전체");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    getTireModelCompatibleBikes(tireModelKey, tireProductId)
      .then((data) => {
        if (active) setBikes(data);
      })
      .catch(() => {
        if (active) setBikes([]);
      });
    return () => {
      active = false;
    };
  }, [tireModelKey, tireProductId]);

  const brands = useMemo(
    () => [
      "전체",
      ...[...new Set((bikes ?? []).map((bike) => bike.brandName))].sort((left, right) =>
        left.localeCompare(right, ["ko", "en"]),
      ),
    ],
    [bikes],
  );

  const filteredBikes = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko-KR");
    return (bikes ?? []).filter(
      (bike) =>
        (selectedBrand === "전체" || bike.brandName === selectedBrand) &&
        (!query || bike.bikeModelName.toLocaleLowerCase("ko-KR").includes(query)),
    );
  }, [bikes, search, selectedBrand]);

  const visibleBikes = expanded ? filteredBikes : filteredBikes.slice(0, INITIAL_ROWS);

  return (
    <section aria-labelledby="compatible-bikes-title" data-compatible-bikes-count={bikes?.length ?? 0}>
      <h2 className="text-xl font-bold text-foreground" id="compatible-bikes-title">호환 바이크</h2>
      <p className="mt-2 text-base text-foreground-secondary">
        선택한 규격을 장착할 수 있는 바이크를 확인하세요.
      </p>

      {bikes === null ? (
        <p className="mt-4 text-sm text-foreground-secondary">호환 바이크를 불러오는 중입니다.</p>
      ) : null}

      {bikes?.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-secondary p-4 text-base text-foreground-secondary">
          현재 등록된 호환 바이크 정보가 없습니다.
        </p>
      ) : null}

      {bikes?.length ? <><label className="mt-5 block" htmlFor="compatible-bike-search">
        <span className="sr-only">바이크 모델 검색</span>
        <input
          className="min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-base text-foreground outline-none placeholder:text-foreground-secondary focus:border-primary"
          id="compatible-bike-search"
          onChange={(event) => {
            setSearch(event.target.value);
            setExpanded(false);
          }}
          placeholder="바이크 모델 검색"
          type="search"
          value={search}
        />
      </label>

      <div
        aria-label="바이크 제조사 선택"
        className="-mx-4 mt-3 flex gap-2 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {brands.map((brand) => {
          const selected = brand === selectedBrand;
          return (
            <button
              aria-pressed={selected}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-foreground"}`}
              key={brand}
              onClick={() => {
                setSelectedBrand(brand);
                setExpanded(false);
              }}
              type="button"
            >
              {brand}
            </button>
          );
        })}
      </div>

      {filteredBikes.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-secondary p-4 text-base text-foreground-secondary">
          조건에 맞는 호환 바이크가 없습니다.
        </p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {visibleBikes.map((bike) => {
              const supplementary = getSupplementaryLabel(bike);
              return (
                <li className="py-4" key={bike.bikeModelYearId}>
                  <p className="text-sm font-semibold text-foreground-secondary">{bike.brandName}</p>
                  <Link
                    className="mt-1 inline-block break-words text-lg font-bold leading-7 text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    href={`/model-detail/${bike.bikeModelYearId}`}
                  >
                    {bike.bikeModelName}
                  </Link>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    {bike.yearRangeLabel}{supplementary ? ` · ${supplementary}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
          {filteredBikes.length > INITIAL_ROWS ? (
            <button
              aria-expanded={expanded}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              {expanded ? "호환 바이크 접기" : `호환 바이크 더보기 (${filteredBikes.length})`}
            </button>
          ) : null}
        </>
      )}</> : null}
    </section>
  );
}
