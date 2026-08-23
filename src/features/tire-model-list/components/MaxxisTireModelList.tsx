import Link from "next/link";

import { TireHeroImage } from "@/features/tire-detail/components/TireHeroImage";
import type { TireModelListItem } from "@/features/tire-detail/types/tire-detail.types";

export function MaxxisTireModelList({ models }: { models: TireModelListItem[] }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-5 sm:py-14">
      <header className="rounded-3xl bg-surface-secondary px-5 py-8 sm:px-8 sm:py-12">
        <p className="text-sm font-bold text-primary">MAXXIS TIRE MODELS</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">MAXXIS 타이어</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-foreground-secondary">
          MAXXIS의 활성 타이어 모델을 살펴보고, 모델별 특징과 판매 규격을 확인하세요.
        </p>
        <Link className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-3 text-base font-bold text-white" href="/bike-selector">
          내 바이크에 맞는 타이어 찾기
        </Link>
      </header>

      <section className="mt-10 sm:mt-14" aria-labelledby="maxxis-list-title">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground" id="maxxis-list-title">타이어 모델</h2>
          <p className="text-sm font-semibold text-foreground-secondary">{models.length}개</p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {models.map((model) => (
            <Link
              className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface p-2.5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-4"
              href={`/tire-detail/model/${model.tireModelKey}`}
              key={model.tireModelKey}
            >
              <TireHeroImage alt={`MAXXIS ${model.displayName}`} sources={[model.mainImageUrl]} />
              <div className="px-1 pb-1 pt-3 sm:px-0 sm:pt-4">
                <h3 className="break-words text-base font-bold leading-6 text-foreground sm:text-lg">{model.displayName}</h3>
                {model.summary ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-foreground-secondary">{model.summary}</p>
                ) : null}
                <span className="mt-3 inline-block text-sm font-bold text-primary">모델 상세 보기</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
