import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";

type Props = {
  model: ModelDetailData;
};

export function ModelDescription({ model }: Props) {
  if (!model.modelFeatures && !model.majorChanges && !model.brandSummary) return null;

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-sm font-semibold text-zinc-500">MODEL INFORMATION</p>
        <h2 className="mt-1 text-xl font-bold text-zinc-950">모델 정보</h2>
      </div>
      {model.modelFeatures ? (
        <article>
          <h3 className="font-semibold text-zinc-950">주요 특징</h3>
          <p className="mt-2 whitespace-pre-line leading-7 text-zinc-700">{model.modelFeatures}</p>
        </article>
      ) : null}
      {model.majorChanges ? (
        <article>
          <h3 className="font-semibold text-zinc-950">주요 변경 사항</h3>
          <p className="mt-2 whitespace-pre-line leading-7 text-zinc-700">{model.majorChanges}</p>
        </article>
      ) : null}
      {model.brandSummary ? (
        <article>
          <h3 className="font-semibold text-zinc-950">브랜드 소개</h3>
          <p className="mt-2 whitespace-pre-line leading-7 text-zinc-700">{model.brandSummary}</p>
        </article>
      ) : null}
    </section>
  );
}
