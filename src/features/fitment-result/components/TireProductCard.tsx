import Link from "next/link";

import type { TireFitmentProduct } from "@/features/fitment-result/types/fitment-result.types";

type Props = {
  product: TireFitmentProduct;
};

function formatPrice(price: number | null) {
  if (price === null) return null;
  return `${price.toLocaleString("ko-KR")}원`;
}

export function TireProductCard({ product }: Props) {
  const price = formatPrice(product.price);

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex gap-4">
        <div
          aria-label={`${product.brandName} ${product.productName} 이미지`}
          className="h-24 w-24 shrink-0 rounded-xl bg-zinc-100 bg-contain bg-center bg-no-repeat"
          role="img"
          style={
            product.productImageUrl
              ? { backgroundImage: `url(${product.productImageUrl})` }
              : undefined
          }
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-500">{product.brandName}</p>
          <h3 className="mt-1 font-bold leading-6 text-zinc-950">{product.productName}</h3>
          {product.tireSizeFull ? (
            <p className="mt-2 text-sm text-zinc-600">{product.tireSizeFull}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
            {product.tubeType ? (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1">{product.tubeType}</span>
            ) : null}
            {product.sellerName ? (
              <span className="rounded-full bg-zinc-100 px-2.5 py-1">{product.sellerName}</span>
            ) : null}
          </div>
          {price ? <p className="mt-3 text-lg font-bold text-zinc-950">{price}</p> : null}
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link
          className="inline-flex flex-1 items-center justify-center rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          href={`/tire-detail/${product.tireProductId}`}
        >
          상세 보기
        </Link>
        {product.productUrl ? (
          <a
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
            href={product.productUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            구매 페이지
          </a>
        ) : null}
      </div>
    </article>
  );
}
