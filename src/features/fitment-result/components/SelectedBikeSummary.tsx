import Link from "next/link";

import type { SelectedBikeSummary as SelectedBikeSummaryType } from "@/features/fitment-result/types/fitment-result.types";

type Props = {
  bike: SelectedBikeSummaryType;
};

export function SelectedBikeSummary({ bike }: Props) {
  const nameKo = bike.modelNameKo ?? bike.modelNameEn;
  const brand = bike.brandNameKo ?? bike.brandNameEn;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {bike.imageUrl ? (
        <div
          aria-label={`${brand} ${nameKo} 이미지`}
          className="aspect-[16/9] w-full bg-zinc-100 bg-contain bg-center bg-no-repeat"
          role="img"
          style={{ backgroundImage: `url(${bike.imageUrl})` }}
        />
      ) : null}
      <div className="space-y-4 p-5 sm:p-7">
        <div>
          <p className="text-sm font-semibold text-zinc-500">{brand}</p>
          <h2 className="mt-1 text-2xl font-bold text-zinc-950">{nameKo}</h2>
          {bike.modelNameKo ? (
            <p className="mt-1 text-sm text-zinc-500">{bike.modelNameEn}</p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-zinc-500">연식</dt>
            <dd className="mt-1 font-semibold text-zinc-900">{bike.yearRangeLabel}</dd>
          </div>
          {bike.engineCc !== null ? (
            <div>
              <dt className="text-zinc-500">배기량</dt>
              <dd className="mt-1 font-semibold text-zinc-900">{bike.engineCc}cc</dd>
            </div>
          ) : null}
          {bike.category ? (
            <div>
              <dt className="text-zinc-500">카테고리</dt>
              <dd className="mt-1 font-semibold text-zinc-900">{bike.category}</dd>
            </div>
          ) : null}
          {bike.generationName ? (
            <div>
              <dt className="text-zinc-500">세대</dt>
              <dd className="mt-1 font-semibold text-zinc-900">{bike.generationName}</dd>
            </div>
          ) : null}
        </dl>
        <Link
          className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          href={`/model-detail/${bike.bikeModelYearId}`}
        >
          모델 상세 보기
        </Link>
      </div>
    </section>
  );
}
