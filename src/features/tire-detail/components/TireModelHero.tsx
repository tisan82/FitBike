import { TireHeroImage } from "@/features/tire-detail/components/TireHeroImage";
import type { TireModelDetailData } from "@/features/tire-detail/types/tire-detail.types";

export function TireModelHero({ model }: { model: TireModelDetailData }) {
  return (
    <section className="grid items-center gap-5 md:grid-cols-2 md:gap-12">
      <TireHeroImage
        alt={`${model.brandName} ${model.displayName} 대표 이미지`}
        preload
        sources={[model.mainImageUrl]}
      />

      <div>
        <p className="text-sm font-semibold text-primary">{model.brandName}</p>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-foreground">
          {model.displayName}
        </h1>
        {model.summary ? (
          <p className="mt-5 text-lg font-semibold leading-7 text-foreground">
            {model.summary}
          </p>
        ) : null}
        {model.description ? (
          <p className="mt-3 whitespace-pre-line text-base leading-7 text-foreground-secondary">
            {model.description}
          </p>
        ) : null}
      </div>
    </section>
  );
}
