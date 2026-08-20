import Link from "next/link";

import { TireHeroImage } from "@/features/tire-detail/components/TireHeroImage";
import { TireBrandLogo } from "@/features/model-detail/components/TireBrandLogo";
import { getTireProductDisplayName } from "@/features/model-detail/utils/tire-product-display";
import type { TireProductDetail } from "@/features/tire-detail/types/tire-detail.types";
import { getTirePositionLabel } from "@/features/tire-detail/utils/tire-position";

function formatPrice(price: number | null) {
  return price === null ? null : `${price.toLocaleString("ko-KR")}원`;
}

export function TireProductSummary({ product }: { product: TireProductDetail }) {
  const displayName = product.model?.displayName ?? getTireProductDisplayName(
    product.brandName,
    product.productName,
  );
  const position = getTirePositionLabel(product.positionType);
  const price = formatPrice(product.price);

  return (
    <section className="grid items-center gap-5 md:grid-cols-2 md:gap-12">
      <TireHeroImage
        alt={`${product.brandName} ${displayName} ${product.tireSizeFull ?? ""} 대표 이미지`}
        preload
        sources={[product.productImageUrl, product.model?.mainImageUrl ?? null]}
      />
      <div>
        <TireBrandLogo brandName={product.brandName} />
        <p className="mt-4 text-sm font-semibold text-primary">선택한 타이어 규격</p>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-foreground">
          {displayName}
        </h1>
        {product.tireSizeFull ? (
          <p className="mt-4 break-words text-xl font-bold leading-8 text-foreground">
            {product.tireSizeFull}
          </p>
        ) : null}
        {position ? <p className="mt-2 text-base text-foreground-secondary">{position}</p> : null}
        {price ? <p className="mt-5 text-2xl font-bold text-foreground">{price}</p> : null}
        {product.model?.summary ? (
          <p className="mt-4 text-base leading-7 text-foreground-secondary">{product.model.summary}</p>
        ) : null}
        {product.model ? (
          <Link
            className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href={`/tire-detail/model/${product.model.tireModelKey}`}
          >
            이 타이어 모델 전체 보기
          </Link>
        ) : null}
      </div>
    </section>
  );
}
