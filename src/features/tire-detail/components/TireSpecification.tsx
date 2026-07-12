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
    { label: "전체 규격", value: product.tireSizeFull },
    { label: "폭", value: product.width },
    { label: "편평비", value: product.ratio },
    { label: "림 직경", value: product.diameter },
    { label: "하중 지수", value: product.loadIndex },
    { label: "속도 지수", value: product.speedIndex },
    { label: "튜브 타입", value: product.tubeType },
    { label: "장착 위치", value: product.positionType },
  ];

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold text-zinc-950">상품 규격</h2>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <div className="rounded-2xl bg-zinc-50 p-4" key={item.label}>
            <dt className="text-sm font-semibold text-zinc-500">{item.label}</dt>
            <dd className="mt-2 font-semibold text-zinc-950">
              {displayValue(item.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
