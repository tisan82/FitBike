import { TireProductCard } from "@/features/fitment-result/components/TireProductCard";
import type {
  FitmentPositionType,
  TireFitmentProduct,
} from "@/features/fitment-result/types/fitment-result.types";

type Props = {
  position: FitmentPositionType;
  products: TireFitmentProduct[];
};

const labels: Record<FitmentPositionType, string> = {
  FRONT: "앞 타이어",
  REAR: "뒤 타이어",
};

export function TireFitmentSection({ position, products }: Props) {
  const filtered = products.filter(
    (product) => product.fitmentPositionType === position,
  );

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-xl font-bold text-zinc-950">{labels[position]}</h2>
        <p className="text-sm text-zinc-500">{filtered.length}개 상품</p>
      </div>
      {filtered.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((product) => (
            <TireProductCard key={product.fitmentId} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-sm text-zinc-600">
          등록된 {labels[position]} 상품이 없습니다.
        </div>
      )}
    </section>
  );
}
