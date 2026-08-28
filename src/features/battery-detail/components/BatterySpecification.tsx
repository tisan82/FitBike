import type { BatteryProductDetail } from "@/features/battery-detail/types/battery-detail.types";

type Props = {
  product: BatteryProductDetail;
};

type SpecificationItem = {
  label: string;
  value: string | number | null;
  unit?: string;
};

function displayValue(item: SpecificationItem) {
  if (item.value === null || item.value === "") return "정보 없음";
  return item.unit ? `${item.value}${item.unit}` : String(item.value);
}

export function BatterySpecification({ product }: Props) {
  const items: SpecificationItem[] = [
    { label: "규격 코드", value: product.specCode },
    { label: "전압", value: product.voltage },
    { label: "용량", value: product.capacityAh, unit: "Ah" },
    { label: "전력량", value: product.wattHour, unit: "Wh" },
    { label: "길이", value: product.lengthMm, unit: "mm" },
    { label: "폭", value: product.widthMm, unit: "mm" },
    { label: "높이", value: product.heightMm, unit: "mm" },
    { label: "무게", value: product.weightKg, unit: "kg" },
    {
      label: "내부 저항",
      value: product.internalResistanceMohm,
      unit: "mΩ",
    },
    {
      label: "연속 방전 CCA",
      value: product.continuousDischargeCca,
      unit: "A",
    },
    { label: "최대 방전 CCA", value: product.maxDischargeCca, unit: "A" },
    { label: "배터리 타입", value: product.batteryType },
    { label: "단자 극성", value: product.terminalPolarity },
    { label: "단자 타입", value: product.terminalType },
  ];

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-8">
      <h2 className="text-xl font-bold text-zinc-950">상품 규격</h2>
      <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-6 sm:gap-4">
        {items.map((item) => (
          <div className="min-w-0 rounded-xl bg-zinc-50 px-3 py-3.5 sm:rounded-2xl sm:p-4" key={item.label}>
            <dt className="text-xs font-semibold leading-5 text-zinc-500 sm:text-sm">{item.label}</dt>
            <dd className="mt-1 break-words text-sm font-bold leading-6 text-zinc-950 sm:mt-2 sm:text-base">
              {displayValue(item)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
