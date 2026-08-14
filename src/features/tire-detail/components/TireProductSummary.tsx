"use client";

import Image from "next/image";
import { useState } from "react";

import { TireBrandLogo } from "@/features/model-detail/components/TireBrandLogo";
import { getTireProductDisplayName } from "@/features/model-detail/utils/tire-product-display";
import type { TireProductDetail } from "@/features/tire-detail/types/tire-detail.types";
import { getTirePositionLabel } from "@/features/tire-detail/utils/tire-position";
import { getStoragePublicUrl } from "@/lib/supabase/storage";

type Props = {
  product: TireProductDetail;
};

function formatPrice(price: number | null) {
  return price === null ? null : `${price.toLocaleString("ko-KR")}원`;
}

export function TireProductSummary({ product }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const displayName = getTireProductDisplayName(
    product.brandName,
    product.productName,
  );
  const imageUrl = imageFailed
    ? null
    : getStoragePublicUrl(product.productImageUrl);
  const position = getTirePositionLabel(product.positionType);
  const price = formatPrice(product.price);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className={imageUrl ? "grid md:grid-cols-2" : undefined}>
        {imageUrl ? (
          <div className="relative aspect-[4/3] bg-surface-secondary">
            <Image
              alt={`${product.brandName} ${displayName} 상품 이미지`}
              className="object-contain"
              fill
              onError={() => setImageFailed(true)}
              sizes="(max-width: 768px) calc(100vw - 40px), 492px"
              src={imageUrl}
            />
          </div>
        ) : null}
        <div className="p-5 sm:p-7">
          <TireBrandLogo brandName={product.brandName} />
          <h2 className="mt-3 text-3xl font-bold leading-none tracking-tight text-foreground">
            {displayName}
          </h2>
          {product.tireSizeFull ? (
            <p className="mt-4 text-base font-semibold text-foreground">
              {product.tireSizeFull}
            </p>
          ) : null}
          <p className="mt-1 text-sm leading-5 text-foreground-secondary">
            {[position, product.tubeType].filter(Boolean).join(" · ")}
          </p>
          {price ? (
            <p className="mt-5 text-xl font-bold text-foreground">{price}</p>
          ) : null}
          {product.sellerName ? (
            <p className="mt-1 text-sm text-foreground-secondary">
              판매처 {product.sellerName}
            </p>
          ) : null}
          {product.productUrl ? (
            <a
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              href={product.productUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {product.sellerName ? `${product.sellerName}에서 보기` : "상품 페이지 보기"}
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
