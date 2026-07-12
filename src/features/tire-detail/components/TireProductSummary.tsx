import type { TireProductDetail } from "@/features/tire-detail/types/tire-detail.types";

type Props = {
  product: TireProductDetail;
};

function formatPrice(price: number | null) {
  return price === null ? null : `${price.toLocaleString("ko-KR")}원`;
}

export function TireProductSummary({ product }: Props) {
  const price = formatPrice(product.price);

  return (
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      <div className="grid gap-0 md:grid-cols-2">
        <div
          aria-label={`${product.brandName} ${product.productName} 이미지`}
          className="min-h-72 bg-zinc-100 bg-contain bg-center bg-no-repeat"
          role="img"
          style={
            product.productImageUrl
              ? { backgroundImage: `url(${product.productImageUrl})` }
              : undefined
          }
        />
        <div className="flex flex-col justify-center p-6 sm:p-8">
          <p className="text-sm font-semibold text-zinc-500">{product.brandName}</p>
          <h2 className="mt-2 text-2xl font-bold leading-tight text-zinc-950">
            {product.productName}
          </h2>
          {product.tireSizeFull ? (
            <p className="mt-4 text-base font-semibold text-zinc-700">
              {product.tireSizeFull}
            </p>
          ) : null}
          {product.sellerName ? (
            <p className="mt-4 text-sm text-zinc-500">판매처 {product.sellerName}</p>
          ) : null}
          {price ? <p className="mt-3 text-2xl font-bold text-zinc-950">{price}</p> : null}
          {product.productUrl ? (
            <a
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800"
              href={product.productUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              구매 페이지 이동
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
