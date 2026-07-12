import type { SelectedBikeSummary } from "@/features/fitment-result/types/fitment-result.types";

type Props = {
  bike: SelectedBikeSummary;
};

export function TireSpecificationSummary({ bike }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-xl font-bold text-zinc-950">순정 타이어 규격</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-zinc-50 p-4">
          <p className="text-sm text-zinc-500">앞 타이어</p>
          <p className="mt-1 text-lg font-bold text-zinc-950">
            {bike.frontTireFullSize ?? "규격 정보 없음"}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 p-4">
          <p className="text-sm text-zinc-500">뒤 타이어</p>
          <p className="mt-1 text-lg font-bold text-zinc-950">
            {bike.rearTireFullSize ?? "규격 정보 없음"}
          </p>
        </div>
      </div>
    </section>
  );
}
