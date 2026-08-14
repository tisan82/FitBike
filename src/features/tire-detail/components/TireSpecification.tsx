import type { TireProductDetail } from "@/features/tire-detail/types/tire-detail.types";

type Props = {
  product: TireProductDetail;
};

type SpecificationItem = {
  label: string;
  value: string | number | null;
};

function displayValue(value: SpecificationItem["value"]) {
  return value === null || value === "" ? "정보 없음" : String(value);
}

export function TireSpecification({ product }: Props) {
  const items: SpecificationItem[] = [
    { label: "폭", value: product.width },
    { label: "편평비", value: product.ratio },
    { label: "림 직경", value: product.diameter },
    { label: "하중 지수", value: product.loadIndex },
    { label: "속도 지수", value: product.speedIndex },
    { label: "튜브 타입", value: product.tubeType },
  ];

  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-bold text-foreground">상품 규격</h2>
      <dl className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-border sm:grid-cols-3">
        {items.map((item, index) => (
          <div
            className={`min-w-0 p-3 sm:p-4 ${index % 2 === 1 ? "border-l border-border" : ""} ${index >= 2 ? "border-t border-border" : ""} sm:border-l sm:border-t-0 sm:[&:nth-child(3n+1)]:border-l-0 sm:[&:nth-child(n+4)]:border-t`}
            key={item.label}
          >
            <dt className="text-xs font-medium text-foreground-secondary">
              {item.label}
            </dt>
            <dd className="mt-1 truncate font-bold text-foreground" title={displayValue(item.value)}>
              {displayValue(item.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
