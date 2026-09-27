import Link from "next/link";

import type { BatteryProductListItem } from "@/features/battery-detail/types/battery-detail.types";
import { BatteryProductCardImage } from "@/features/battery-product-list/components/BatteryProductCardImage";

function formatPrice(price: number | null) {
  return price === null ? null : `${price.toLocaleString("ko-KR")}원`;
}

function dimensions(product: BatteryProductListItem) {
  if (product.lengthMm === null || product.widthMm === null || product.heightMm === null) return null;
  return `${product.lengthMm}×${product.widthMm}×${product.heightMm}mm`;
}

export function PoweroadBatteryProductList({
  products,
}: {
  products: BatteryProductListItem[];
}) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-5 sm:py-14">
      <nav aria-label="현재 위치" className="mb-5 text-sm text-foreground-secondary">
        <Link className="hover:text-primary" href="/">핏바이크</Link>
        <span aria-hidden className="mx-2">›</span>
        <span aria-current="page" className="font-semibold text-foreground">POWEROAD 배터리</span>
      </nav>

      <header className="rounded-3xl bg-surface-secondary px-5 py-8 sm:px-8 sm:py-12">
        <p className="text-sm font-bold text-primary">POWEROAD BATTERIES</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">POWEROAD 오토바이 배터리</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-foreground-secondary">
          FitBike에 등록된 POWEROAD 배터리의 규격과 호환 바이크를 확인하세요. 구매 전에는 모델과 연식을 기준으로 실제 장착 규격을 함께 확인해야 합니다.
        </p>
        <Link className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-3 text-base font-bold text-white" href="/bike-selector?part=battery">
          내 바이크에 맞는 배터리 찾기
        </Link>
      </header>

      <section aria-labelledby="poweroad-battery-list-title" className="mt-10 sm:mt-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground" id="poweroad-battery-list-title">배터리 상품</h2>
          <p className="text-sm font-semibold text-foreground-secondary">{products.length}개</p>
        </div>

        {products.length ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const size = dimensions(product);
              const price = formatPrice(product.price);
              return (
                <Link
                  className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-2.5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-4"
                  href={`/battery-detail/${product.batteryProductId}`}
                  key={product.batteryProductId}
                >
                  <BatteryProductCardImage brandName={product.brandName} imagePath={product.productImageUrl} specCode={product.specCode} />
                  <div className="px-1 pb-1 pt-3 sm:px-0 sm:pt-4">
                    <p className="text-sm font-bold text-primary">{product.brandName}</p>
                    <h3 className="mt-1 break-words text-base font-bold leading-6 text-foreground sm:text-lg">{product.specCode}</h3>
                    <div className="mt-2 space-y-1 text-sm leading-6 text-foreground-secondary">
                      {product.voltage ? <p>{product.voltage}V</p> : null}
                      {product.capacityAh !== null ? <p>{product.capacityAh}Ah</p> : null}
                      {product.continuousDischargeCca !== null ? <p>CCA {product.continuousDischargeCca}A</p> : null}
                      {size ? <p>{size}</p> : null}
                    </div>
                    {price ? <p className="mt-3 text-base font-bold text-foreground">{price}</p> : null}
                    <span className="mt-3 inline-block text-sm font-bold text-primary">규격·호환 모델 보기</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-border bg-surface p-5 text-base leading-7 text-foreground-secondary">
            현재 공개된 POWEROAD 배터리 상품이 없습니다.
          </p>
        )}
      </section>
    </main>
  );
}
