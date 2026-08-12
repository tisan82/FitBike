import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";
export function ModelDescription({ model }: { model: ModelDetailData }) {
  if (!model.modelFeatures && !model.majorChanges) return null;
  return <section className="space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7"><div><p className="text-sm font-semibold text-foreground-secondary">MODEL INFORMATION</p><h2 className="mt-1 text-xl font-bold">모델 정보</h2></div>{model.modelFeatures ? <article><h3 className="font-semibold">모델 특징</h3><p className="mt-2 whitespace-pre-line leading-7 text-foreground-secondary">{model.modelFeatures}</p></article> : null}{model.majorChanges ? <article><h3 className="font-semibold">이 연식의 주요 변경</h3><p className="mt-2 whitespace-pre-line leading-7 text-foreground-secondary">{model.majorChanges}</p></article> : null}</section>;
}
