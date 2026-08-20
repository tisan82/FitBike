import type { TireProductDetail } from "@/features/tire-detail/types/tire-detail.types";

function safeProductUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function TirePurchaseCTA({ product }: { product: TireProductDetail }) {
  const productUrl = safeProductUrl(product.productUrl);
  if (!productUrl) return null;

  return (
    <section aria-labelledby="tire-purchase-title" className="rounded-2xl bg-surface-secondary p-4 sm:p-6">
      <h2 className="text-xl font-bold text-foreground" id="tire-purchase-title">구매하기</h2>
      {product.price !== null ? (
        <p className="mt-3 text-2xl font-bold text-foreground">{product.price.toLocaleString("ko-KR")}원</p>
      ) : null}
      <a
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto"
        href={productUrl}
        rel="noopener noreferrer"
        target="_blank"
      >
        스마트스토어에서 구매하기
      </a>
    </section>
  );
}
