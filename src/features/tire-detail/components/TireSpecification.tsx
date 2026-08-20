import type { TireProductDetail } from "@/features/tire-detail/types/tire-detail.types";
import { getTirePositionLabel } from "@/features/tire-detail/utils/tire-position";

type SpecificationItem = { label: string; value: string | number | null };

export function TireSpecification({ product }: { product: TireProductDetail }) {
  const items: SpecificationItem[] = [
    { label: "전체 규격", value: product.tireSizeFull },
    { label: "장착 위치", value: getTirePositionLabel(product.positionType) },
    { label: "타이어 폭", value: product.width === null ? null : `${product.width}mm` },
    { label: "편평비", value: product.ratio === null ? null : `${product.ratio}%` },
    { label: "림 직경", value: product.diameter === null ? null : `${product.diameter}인치` },
    { label: "하중지수", value: product.loadIndex },
    { label: "속도등급", value: product.speedIndex },
    { label: "튜브 타입", value: product.tubeType },
  ].filter((item) => item.value !== null && item.value !== "");

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="selected-tire-specification">
      <h2 className="text-xl font-bold text-foreground" id="selected-tire-specification">
        선택한 규격 상세
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3">
        {items.map((item) => (
          <div className="min-w-0" key={item.label}>
            <dt className="text-sm font-medium text-foreground-secondary">{item.label}</dt>
            <dd className="mt-1 break-words text-base font-semibold leading-6 text-foreground">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
