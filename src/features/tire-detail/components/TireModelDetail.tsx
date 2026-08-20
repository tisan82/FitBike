import { TireModelHero } from "@/features/tire-detail/components/TireModelHero";
import { TireModelImageSection } from "@/features/tire-detail/components/TireModelImageSection";
import { TireModelSkuList } from "@/features/tire-detail/components/TireModelSkuList";
import { TireSizeGuide } from "@/features/tire-detail/components/TireSizeGuide";
import type { TireModelDetailData } from "@/features/tire-detail/types/tire-detail.types";

export function TireModelDetail({ model }: { model: TireModelDetailData }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-5 sm:py-14">
      <div className="space-y-8 sm:space-y-16">
        <TireModelHero model={model} />

        <section aria-labelledby="tire-skus-title">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-foreground" id="tire-skus-title">내 타이어 규격 선택</h2>
            <p className="mt-2 text-base text-foreground-secondary">
              장착 위치와 규격을 선택하면 상세 정보와 구매 페이지로 이동합니다.
            </p>
          </div>
          <TireModelSkuList skus={model.skus} />
        </section>

        {model.features.length > 0 ? (
          <section aria-labelledby="tire-features-title">
            <h2 className="text-xl font-bold text-foreground" id="tire-features-title">주요 특징</h2>
            <div className="mt-4 divide-y divide-border">
              {model.features.map((feature) => (
                <article className="grid gap-3 py-5 first:pt-0 sm:grid-cols-[3rem_1fr] sm:gap-5 sm:py-6" key={feature.number}>
                  <p className="text-lg font-bold text-primary">{feature.number}</p>
                  <div>
                    <h3 className="text-lg font-bold leading-7 text-foreground">{feature.title}</h3>
                    {feature.description ? (
                      <p className="mt-2 whitespace-pre-line text-base leading-7 text-foreground-secondary">
                        {feature.description}
                      </p>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {model.subImageUrl1 ? (
          <TireModelImageSection
            alt={`${model.brandName} ${model.displayName} 상세 이미지 1`}
            imageUrl={model.subImageUrl1}
          />
        ) : null}

        <TireSizeGuide />

        {model.subImageUrl2 ? (
          <TireModelImageSection
            alt={`${model.brandName} ${model.displayName} 상세 이미지 2`}
            imageUrl={model.subImageUrl2}
          />
        ) : null}
      </div>
    </main>
  );
}
