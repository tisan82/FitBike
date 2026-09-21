"use client";

import Image from "next/image";
import { useState } from "react";

import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";
import { getStoragePublicUrl } from "@/lib/supabase/storage";

const BIKE_IMAGE_FALLBACK_SRC = "/images/common/no-image-bike.svg";

function Item({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === "") return null;
  return <div><dt className="text-sm text-foreground-secondary">{label}</dt><dd className="mt-1 text-base font-semibold leading-6">{value}</dd></div>;
}

function SpecSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="border-t border-border pt-5"><h3 className="mb-4 text-base font-bold">{title}</h3><dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">{children}</dl></div>;
}

function formatPrice(min: number | null, max: number | null) {
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min !== max) return `${min.toLocaleString("ko-KR")} ~ ${max.toLocaleString("ko-KR")}원`;
  return `${(min ?? max)?.toLocaleString("ko-KR")}원`;
}

function formatPower(model: ModelDetailData) {
  if (model.maxPowerPs === null && model.maxPowerKw === null) return null;
  const output = [model.maxPowerPs === null ? null : `${model.maxPowerPs}PS`, model.maxPowerKw === null ? null : `${model.maxPowerKw}kW`].filter(Boolean).join(" / ");
  return model.maxPowerRpm === null ? output : `${output} @ ${model.maxPowerRpm.toLocaleString("ko-KR")}rpm`;
}

function formatTorque(model: ModelDetailData) {
  if (model.maxTorqueNm === null) return null;
  return model.maxTorqueRpm === null ? `${model.maxTorqueNm}N·m` : `${model.maxTorqueNm}N·m @ ${model.maxTorqueRpm.toLocaleString("ko-KR")}rpm`;
}

export function ModelSummary({ model }: { model: ModelDetailData }) {
  const [failed, setFailed] = useState(false);
  const brand = model.brandNameKo ?? model.brandNameEn;
  const name = model.modelNameKo ?? model.modelNameEn;
  const modelImageUrl = getStoragePublicUrl(model.imageUrl);
  const useFallback = failed || !modelImageUrl;
  const src = useFallback ? BIKE_IMAGE_FALLBACK_SRC : modelImageUrl;
  const dimensions = [model.lengthMm, model.widthMm, model.heightMm].every((value) => value !== null)
    ? `${model.lengthMm} × ${model.widthMm} × ${model.heightMm} mm`
    : null;
  const hasEngine = [model.engineType, model.coolingType, model.fuelSystem, model.transmissionType, model.maxPowerPs, model.maxPowerKw, model.maxTorqueNm].some((value) => value !== null);
  const hasChassis = [dimensions, model.wheelbaseMm, model.seatHeightMm, model.curbWeightKg, model.fuelCapacityL].some((value) => value !== null);
  const hasOil = [model.engineOilChangeL, model.engineOilFilterChangeL, model.engineOilTotalL, model.engineOilSae, model.engineOilApi, model.engineOilJaso].some((value) => value !== null);
  const price = formatPrice(model.priceMinKrw, model.priceMaxKrw);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="relative flex aspect-[16/9] items-center justify-center bg-surface-secondary">
        <Image alt={useFallback ? `${brand} ${name} 이미지 준비중` : `${brand} ${name} ${model.yearRangeLabel} 대표 이미지`} className={useFallback ? "object-cover" : "object-contain"} fill onError={useFallback ? undefined : () => setFailed(true)} preload sizes="(max-width: 1024px) calc(100vw - 40px), 984px" src={src} unoptimized={useFallback} />
      </div>
      <div className="space-y-5 p-5 sm:p-7">
        <p className="text-2xl font-bold">{model.yearRangeLabel}</p>
        {model.modelSummary ? <p className="leading-7 text-foreground-secondary">{model.modelSummary}</p> : null}
        <dl className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Item label="배기량" value={model.engineCc === null ? null : `${Math.round(model.engineCc)}cc`} />
          <Item label="카테고리" value={model.category} />
          <Item label="프레임 코드" value={model.frameCode} />
          <Item label="트림" value={model.trimName} />
          <Item label="버전" value={model.variantName} />
          <Item label="판매 시장" value={model.marketCode} />
          <Item label="국내 가격" value={price} />
        </dl>
        {hasEngine ? <SpecSection title="엔진 · 성능">
          <Item label="엔진 형식" value={model.engineType} />
          <Item label="냉각 방식" value={model.coolingType} />
          <Item label="연료 공급" value={model.fuelSystem} />
          <Item label="변속 방식" value={model.transmissionType} />
          <Item label="최고출력" value={formatPower(model)} />
          <Item label="최대토크" value={formatTorque(model)} />
        </SpecSection> : null}
        {hasChassis ? <SpecSection title="차체 제원">
          <Item label="전장 × 전폭 × 전고" value={dimensions} />
          <Item label="휠베이스" value={model.wheelbaseMm === null ? null : `${model.wheelbaseMm}mm`} />
          <Item label="시트고" value={model.seatHeightMm === null ? null : `${model.seatHeightMm}mm`} />
          <Item label="차량 중량" value={model.curbWeightKg === null ? null : `${model.curbWeightKg}kg`} />
          <Item label="연료탱크" value={model.fuelCapacityL === null ? null : `${model.fuelCapacityL}L`} />
        </SpecSection> : null}
        {hasOil ? <SpecSection title="엔진오일">
          <Item label="일반 교환량" value={model.engineOilChangeL === null ? null : `${model.engineOilChangeL}L`} />
          <Item label="필터 동시 교환량" value={model.engineOilFilterChangeL === null ? null : `${model.engineOilFilterChangeL}L`} />
          <Item label="전체 용량" value={model.engineOilTotalL === null ? null : `${model.engineOilTotalL}L`} />
          <Item label="SAE" value={model.engineOilSae} />
          <Item label="API" value={model.engineOilApi} />
          <Item label="JASO" value={model.engineOilJaso} />
        </SpecSection> : null}
      </div>
    </section>
  );
}
