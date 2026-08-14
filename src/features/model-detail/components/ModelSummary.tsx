"use client";

import Image from "next/image";
import { useState } from "react";

import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";
import { getStoragePublicUrl } from "@/lib/supabase/storage";

function Item({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  if (value === null || value === "") return null;

  return (
    <div>
      <dt className="text-sm text-foreground-secondary">{label}</dt>
      <dd className="mt-1 text-base font-semibold leading-6">{value}</dd>
    </div>
  );
}

export function ModelSummary({ model }: { model: ModelDetailData }) {
  const [failed, setFailed] = useState(false);
  const brand = model.brandNameKo ?? model.brandNameEn;
  const name = model.modelNameKo ?? model.modelNameEn;
  const src = failed ? null : getStoragePublicUrl(model.imageUrl);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="relative flex aspect-[16/9] items-center justify-center bg-surface-secondary">
        {src ? (
          <Image
            alt={`${brand} ${name} ${model.yearRangeLabel} 대표 이미지`}
            className="object-contain"
            fill
            onError={() => setFailed(true)}
            preload
            sizes="(max-width: 1024px) calc(100vw - 40px), 984px"
            src={src}
          />
        ) : (
          <p className="text-sm text-foreground-secondary">
            바이크 이미지 준비중
          </p>
        )}
      </div>
      <div className="space-y-5 p-5 sm:p-7">
        <p className="text-2xl font-bold">{model.yearRangeLabel}</p>
        {model.modelSummary ? (
          <p className="leading-7 text-foreground-secondary">
            {model.modelSummary}
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Item
            label="배기량"
            value={model.engineCc === null ? null : `${model.engineCc}cc`}
          />
          <Item label="카테고리" value={model.category} />
          <Item label="세대" value={model.generationName} />
          <Item label="프레임 코드" value={model.frameCode} />
          <Item label="트림" value={model.trimName} />
          <Item label="버전" value={model.variantName} />
          <Item label="판매 시장" value={model.marketCode} />
        </dl>
      </div>
    </section>
  );
}
