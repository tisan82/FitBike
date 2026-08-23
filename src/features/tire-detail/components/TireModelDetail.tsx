import Link from "next/link";

import { TireModelHero } from "@/features/tire-detail/components/TireModelHero";
import { TireModelImageSection } from "@/features/tire-detail/components/TireModelImageSection";
import { TireModelSkuList } from "@/features/tire-detail/components/TireModelSkuList";
import { TireSizeGuide } from "@/features/tire-detail/components/TireSizeGuide";
import type { TireModelDetailData } from "@/features/tire-detail/types/tire-detail.types";
import { getTirePositionLabel } from "@/features/tire-detail/utils/tire-position";

const TUBE_TYPE_LABELS: Record<string, string> = {
  TL: "튜브리스",
  TT: "튜브 타입",
};

function getProductAttributes(model: TireModelDetailData) {
  const positions = [...new Set(model.skus.map((sku) => sku.positionType).filter(Boolean))]
    .map((position) => getTirePositionLabel(position));
  const diameters = [...new Set(model.skus.map((sku) => sku.diameter).filter((value): value is number => value !== null))]
    .sort((left, right) => left - right)
    .map((diameter) => `${diameter}인치`);
  const tubeTypes = [...new Set(model.skus.map((sku) => sku.tubeType?.trim()).filter((value): value is string => Boolean(value)))]
    .map((tubeType) => TUBE_TYPE_LABELS[tubeType] ?? tubeType);

  return [
    ["장착 위치", positions.join(" · ")],
    ["림 직경", diameters.join(" · ")],
    ["타이어 타입", tubeTypes.join(" · ")],
    ["카테고리", model.categoryType ?? ""],
    ["주행 유형", model.ridingType ?? ""],
  ].filter((attribute): attribute is [string, string] => Boolean(attribute[1]));
}

export function TireModelDetail({ model }: { model: TireModelDetailData }) {
  const attributes = getProductAttributes(model);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-5 sm:py-14">
      <div className="space-y-8 sm:space-y-16">
        <TireModelHero model={model} />

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

        {attributes.length > 0 ? (
          <section aria-labelledby="tire-attributes-title">
            <h2 className="text-xl font-bold text-foreground" id="tire-attributes-title">제품 정보</h2>
            <dl className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
              {attributes.map(([label, value]) => (
                <div className="bg-surface p-4" key={label}>
                  <dt className="text-sm font-semibold text-foreground-secondary">{label}</dt>
                  <dd className="mt-1 text-base font-bold text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <TireSizeGuide />

        <section aria-labelledby="tire-skus-title">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-foreground" id="tire-skus-title">내 타이어 규격 선택</h2>
            <p className="mt-2 text-base text-foreground-secondary">
              장착 위치와 규격을 선택하면 상세 정보와 구매 페이지로 이동합니다.
            </p>
          </div>
          <TireModelSkuList skus={model.skus} />
        </section>

        {model.subImageUrl2 ? (
          <section aria-labelledby="tire-usage-title">
            <div className="mb-4">
              <h2 className="text-xl font-bold text-foreground" id="tire-usage-title">주행 환경</h2>
              <p className="mt-2 text-base text-foreground-secondary">이 타이어가 사용되는 주행 장면을 확인해 보세요.</p>
            </div>
            <TireModelImageSection
              alt={`${model.brandName} ${model.displayName} 주행 환경`}
              imageUrl={model.subImageUrl2}
            />
          </section>
        ) : null}

        <section className="rounded-2xl bg-surface-secondary p-5 text-center sm:p-8" aria-labelledby="maxxis-models-title">
          <h2 className="text-xl font-bold text-foreground" id="maxxis-models-title">다른 MAXXIS 타이어도 살펴보세요</h2>
          <Link className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-3 text-base font-bold text-white" href="/tire-models/maxxis">
            MAXXIS 타이어 전체 보기
          </Link>
        </section>
      </div>
    </main>
  );
}
