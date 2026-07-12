import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";

type Props = {
  model: ModelDetailData;
};

function DetailItem({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === "") return null;

  return (
    <div>
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

export function ModelSummary({ model }: Props) {
  const brandName = model.brandNameKo ?? model.brandNameEn;
  const modelName = model.modelNameKo ?? model.modelNameEn;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      {model.imageUrl ? (
        <div
          aria-label={`${brandName} ${modelName} 이미지`}
          className="aspect-[16/9] w-full bg-zinc-100 bg-contain bg-center bg-no-repeat"
          role="img"
          style={{ backgroundImage: `url(${model.imageUrl})` }}
        />
      ) : (
        <div className="flex aspect-[16/9] items-center justify-center bg-zinc-100 text-sm text-zinc-500">
          등록된 대표 이미지가 없습니다.
        </div>
      )}

      <div className="space-y-6 p-5 sm:p-7">
        <div>
          <p className="text-sm font-semibold text-zinc-500">{brandName}</p>
          <h2 className="mt-1 text-2xl font-bold text-zinc-950">{modelName}</h2>
          {model.modelNameKo ? (
            <p className="mt-1 text-sm text-zinc-500">{model.modelNameEn}</p>
          ) : null}
          {model.modelSummary ? (
            <p className="mt-4 leading-7 text-zinc-700">{model.modelSummary}</p>
          ) : null}
        </div>

        <dl className="grid grid-cols-2 gap-x-5 gap-y-6 text-sm sm:grid-cols-4">
          <DetailItem label="연식" value={model.yearRangeLabel} />
          <DetailItem label="배기량" value={model.engineCc === null ? null : `${model.engineCc}cc`} />
          <DetailItem label="카테고리" value={model.category} />
          <DetailItem label="세대" value={model.generationName} />
          <DetailItem label="프레임 코드" value={model.frameCode} />
          <DetailItem label="트림" value={model.trimName} />
          <DetailItem label="버전" value={model.variantName} />
          <DetailItem label="판매 시장" value={model.marketCode} />
        </dl>
      </div>
    </section>
  );
}
