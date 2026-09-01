"use client";

import Image from "next/image";
import { useState } from "react";

import type { BatteryProductDetail } from "@/features/battery-detail/types/battery-detail.types";
import { getStoragePublicUrl } from "@/lib/supabase/storage";

const BATTERY_IMAGE_FALLBACK_SRC = "/images/common/no-image-battery.svg";

type Props = {
  product: BatteryProductDetail;
};

function formatPrice(price: number | null) {
  return price === null ? null : `${price.toLocaleString("ko-KR")}원`;
}

function batteryTypeLabel(value: string | null) {
  if (value === "LITHIUM") return "리튬";
  if (value === "AGM") return "AGM";
  if (value === "MF") return "MF";
  if (value === "GEL") return "GEL";
  return value;
}

export function BatteryProductSummary({ product }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const price = formatPrice(product.price);
  const productImageUrl = getStoragePublicUrl(product.productImageUrl, "battery-assets");
  const useFallback = imageFailed || !productImageUrl;
  const imageUrl = useFallback ? BATTERY_IMAGE_FALLBACK_SRC : productImageUrl;
  const batteryType = batteryTypeLabel(product.batteryType);

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
      <div className="grid md:grid-cols-2">
        <div className="flex min-h-72 items-center justify-center bg-surface-secondary p-5 sm:p-8">
          <Image
            alt={useFallback ? `${product.brandName} ${product.specCode} 이미지 준비중` : `${product.brandName} ${product.specCode} 배터리`}
            className={useFallback ? "min-h-64 w-full rounded-2xl object-cover" : "h-auto max-h-[420px] w-full object-contain"}
            height={720}
            onError={useFallback ? undefined : () => setImageFailed(true)}
            priority
            src={imageUrl}
            unoptimized
            width={720}
          />
        </div>
        <div className="flex flex-col justify-center p-5 sm:p-8">
          <p className="text-sm font-bold text-primary">{product.brandName}</p>
          <h1 className="mt-2 text-2xl font-bold leading-9 text-foreground sm:text-3xl">
            {product.specCode}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {product.voltage ? <span className="rounded-full bg-selected-background px-3 py-1 text-sm font-semibold text-primary">{product.voltage}V</span> : null}
            {product.capacityAh !== null ? <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm font-semibold">{product.capacityAh}Ah</span> : null}
            {batteryType ? <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm font-semibold">{batteryType}</span> : null}
            {product.continuousDischargeCca !== null ? <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm font-semibold">CCA {product.continuousDischargeCca}A</span> : null}
          </div>

          <p className="mt-5 text-sm leading-6 text-foreground-secondary">
            구매 전에는 규격 코드뿐 아니라 크기, 단자 극성, 배터리 타입과 내 바이크의 기준 규격을 함께 확인하세요.
          </p>

          {price ? <p className="mt-5 text-2xl font-bold text-foreground">{price}</p> : null}

          {product.productUrl ? (
            <a
              className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-white transition hover:bg-primary-hover"
              href={product.productUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              스마트스토어에서 구매하기
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
