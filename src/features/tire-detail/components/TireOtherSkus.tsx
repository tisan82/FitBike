import Link from "next/link";

import type { TireModelSku } from "@/features/tire-detail/types/tire-detail.types";
import { getTirePositionLabel } from "@/features/tire-detail/utils/tire-position";

export function TireOtherSkus({ skus }: { skus: TireModelSku[] }) {
  if (skus.length === 0) return null;

  return (
    <section aria-labelledby="other-tire-skus-title">
      <h2 className="text-xl font-bold text-foreground" id="other-tire-skus-title">다른 판매 규격</h2>
      <div className="mt-4 space-y-2.5">
        {skus.map((sku) => (
          <Link
            className="grid min-h-11 gap-2 rounded-2xl bg-surface-secondary p-4 hover:bg-selected-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1fr)_auto]"
            href={`/tire-detail/${sku.tireProductId}`}
            key={sku.tireProductId}
          >
            <div>
              <p className="break-words text-lg font-bold text-foreground">{sku.tireSizeFull ?? "규격 정보"}</p>
              {sku.positionType ? <p className="mt-1 text-sm text-foreground-secondary">{getTirePositionLabel(sku.positionType)}</p> : null}
            </div>
            <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
              {sku.price !== null ? <p className="text-base font-bold text-foreground">{sku.price.toLocaleString("ko-KR")}원</p> : <span />}
              <span aria-hidden className="text-lg text-primary">→</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
