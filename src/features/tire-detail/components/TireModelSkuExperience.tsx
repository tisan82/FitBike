"use client";

import { useMemo, useState } from "react";

import { TireModelFitmentList } from "@/features/tire-detail/components/TireModelFitmentList";
import type { TireModelSku } from "@/features/tire-detail/types/tire-detail.types";
import { getTirePositionLabel } from "@/features/tire-detail/utils/tire-position";

const POSITION_ORDER = { FRONT: 0, REAR: 1, BOTH: 2, COMMON: 3 } as const;

function getPositionOrder(position: TireModelSku["positionType"]) {
  return position ? POSITION_ORDER[position] : 4;
}

export function TireModelSkuExperience({
  skus,
  tireModelKey,
}: {
  skus: TireModelSku[];
  tireModelKey: string;
}) {
  const orderedSkus = useMemo(
    () => skus
      .map((sku, index) => ({ sku, index }))
      .sort((left, right) =>
        getPositionOrder(left.sku.positionType) - getPositionOrder(right.sku.positionType) ||
        left.index - right.index,
      )
      .map(({ sku }) => sku),
    [skus],
  );
  const [selectedTireProductId, setSelectedTireProductId] = useState(
    orderedSkus[0]?.tireProductId ?? null,
  );
  const selectedSku = orderedSkus.find(
    (sku) => sku.tireProductId === selectedTireProductId,
  );

  if (!selectedSku) {
    return (
      <section aria-labelledby="tire-skus-title">
        <h2 className="text-xl font-bold text-foreground" id="tire-skus-title">제품 규격</h2>
        <p className="mt-4 rounded-2xl bg-surface-secondary p-4 text-base text-foreground-secondary">
          현재 판매 중인 규격이 없습니다.
        </p>
      </section>
    );
  }

  const specs = [
    ["폭", selectedSku.width === null ? "" : String(selectedSku.width)],
    ["편평비", selectedSku.ratio === null ? "" : String(selectedSku.ratio)],
    ["휠", selectedSku.diameter === null ? "" : `${selectedSku.diameter}인치`],
    ["하중지수", selectedSku.loadIndex === null ? "" : String(selectedSku.loadIndex)],
    ["속도등급", selectedSku.speedIndex ?? ""],
    ["타입", selectedSku.tubeType ?? ""],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <div className="space-y-8 sm:space-y-12">
      <section aria-labelledby="tire-skus-title">
        <h2 className="text-xl font-bold text-foreground" id="tire-skus-title">제품 규격</h2>
        <p className="mt-2 text-base text-foreground-secondary">확인하려는 타이어 규격을 선택하세요.</p>
        <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {orderedSkus.map((sku) => {
            const selected = sku.tireProductId === selectedTireProductId;
            const secondary = [
              sku.loadIndex === null ? null : `${sku.loadIndex}${sku.speedIndex ?? ""}`,
              sku.tubeType,
            ].filter(Boolean).join(" · ");
            return (
              <button
                aria-pressed={selected}
                className={`w-[min(82vw,20rem)] shrink-0 snap-start rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary bg-selected-background" : "border-border bg-surface"}`}
                key={sku.tireProductId}
                onClick={() => setSelectedTireProductId(sku.tireProductId)}
                type="button"
              >
                <span className="text-sm font-bold text-primary">{getTirePositionLabel(sku.positionType) ?? "기타 규격"}</span>
                <span className="mt-2 block break-words text-lg font-bold leading-7 text-foreground">{sku.tireSizeFull ?? "규격 정보"}</span>
                {secondary ? <span className="mt-1 block text-sm text-foreground-secondary">{secondary}</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="selected-sku-title">
        <h2 className="text-xl font-bold text-foreground" id="selected-sku-title">선택 규격</h2>
        <p className="mt-4 text-sm font-bold text-primary">{getTirePositionLabel(selectedSku.positionType) ?? "기타 규격"}</p>
        <p className="mt-1 break-words text-lg font-bold leading-7 text-foreground">{selectedSku.tireSizeFull ?? "규격 정보"}</p>
        {specs.length ? (
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
            {specs.map(([label, value]) => (
              <div className="bg-surface p-3" key={label}>
                <dt className="text-sm font-semibold text-foreground-secondary">{label}</dt>
                <dd className="mt-1 text-base font-bold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <TireModelFitmentList
        key={selectedSku.tireProductId}
        tireModelKey={tireModelKey}
        tireProductId={selectedSku.tireProductId}
      />
    </div>
  );
}
