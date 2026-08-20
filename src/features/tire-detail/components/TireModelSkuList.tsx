import Link from "next/link";

import type {
  TireModelSku,
  TirePositionType,
} from "@/features/tire-detail/types/tire-detail.types";
import { getTirePositionLabel } from "@/features/tire-detail/utils/tire-position";

const POSITION_ORDER: Array<TirePositionType | "UNSPECIFIED"> = [
  "FRONT",
  "REAR",
  "BOTH",
  "COMMON",
  "UNSPECIFIED",
];

function formatPrice(price: number | null) {
  return price === null ? null : `${price.toLocaleString("ko-KR")}원`;
}

export function TireModelSkuList({ skus }: { skus: TireModelSku[] }) {
  if (skus.length === 0) {
    return (
      <p className="rounded-2xl bg-surface-secondary p-4 text-base text-foreground-secondary">
        현재 판매 중인 규격이 없습니다.
      </p>
    );
  }

  const grouped = Map.groupBy(skus, (sku) => sku.positionType ?? "UNSPECIFIED");

  return (
    <div className="space-y-6">
      {POSITION_ORDER.flatMap((position) => {
        const items = grouped.get(position);
        if (!items?.length) return [];
        const label = position === "UNSPECIFIED" ? "기타 규격" : getTirePositionLabel(position);
        return [
          <section aria-label={label ?? "판매 규격"} key={position}>
            <h3 className="text-lg font-bold text-foreground">{label}</h3>
            <div className="mt-3 space-y-2.5">
              {items.map((sku) => {
                const price = formatPrice(sku.price);
                return (
                  <Link
                    className="grid min-h-11 gap-3 rounded-2xl bg-surface-secondary p-4 transition-colors hover:bg-selected-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    href={`/tire-detail/${sku.tireProductId}`}
                    key={sku.tireProductId}
                  >
                    <div className="min-w-0">
                      <p className="break-words text-lg font-bold leading-7 text-foreground">
                        {sku.tireSizeFull ?? "규격 정보"}
                      </p>
                      {label ? <p className="mt-1 text-sm font-medium text-foreground-secondary">{label}</p> : null}
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:block sm:text-right">
                      {price ? <p className="text-base font-bold text-foreground">{price}</p> : <span />}
                      <span className="text-sm font-semibold text-primary">이 규격 보기</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>,
        ];
      })}
    </div>
  );
}
