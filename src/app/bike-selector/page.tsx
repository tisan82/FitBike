import type { Metadata } from "next";
import Link from "next/link";
import { BikeSelector } from "@/features/bike-selector";
import { findModelSearchEntries } from "@/repositories/model-detail.repository";

export const metadata: Metadata = {
  title: "내 바이크 선택",
  description: "오토바이 브랜드, 모델, 연식을 순서대로 선택해 해당 바이크의 타이어, 배터리, 브레이크 규격을 확인하세요.",
  alternates: { canonical: "/bike-selector" },
};

export default async function BikeSelectorPage() {
  const entries = await findModelSearchEntries();
  const latestByModel = Array.from(
    new Map(entries.map((entry) => [entry.bike_model_id, entry])).values(),
  );
  const modelsByBrand = Array.from(
    latestByModel.reduce((groups, entry) => {
      const key = entry.brand_en;
      const current = groups.get(key) ?? {
        brandEn: entry.brand_en,
        brandKo: entry.brand_ko,
        models: [] as typeof latestByModel,
      };
      current.models.push(entry);
      groups.set(key, current);
      return groups;
    }, new Map<string, { brandEn: string; brandKo: string | null; models: typeof latestByModel }>()),
  ).map(([, group]) => ({
    ...group,
    models: group.models.sort((a, b) =>
      (a.model_name_ko ?? a.model_name_en).localeCompare(
        b.model_name_ko ?? b.model_name_en,
        "ko",
      ),
    ),
  })).sort((a, b) => (a.brandKo ?? a.brandEn).localeCompare(b.brandKo ?? b.brandEn, "ko"));

  return <>
    <BikeSelector />
    <section className="mx-auto w-full max-w-4xl px-5 pb-12 pt-6" aria-labelledby="model-directory-heading">
      <details className="group overflow-hidden rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none [&::-webkit-details-marker]:hidden">
          <span>
            <span id="model-directory-heading" className="block text-base font-bold">등록 모델 전체 보기</span>
            <span className="mt-1 block text-sm leading-5 text-foreground-secondary">브랜드별 최신 연식 모델 링크</span>
          </span>
          <span aria-hidden="true" className="text-xl font-normal text-primary transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="border-t border-border px-5 py-6">
          <p className="text-sm leading-6 text-foreground-secondary">
            브랜드별 모델명을 선택하면 FitBike에 등록된 최신 연식 상세로 이동합니다.
          </p>
          <div className="mt-6 space-y-8">
            {modelsByBrand.map((group) => (
              <section key={group.brandEn} aria-labelledby={`brand-${group.brandEn.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`}>
                <h3
                  id={`brand-${group.brandEn.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`}
                  className="text-lg font-bold"
                >
                  {group.brandKo ? `${group.brandKo} (${group.brandEn})` : group.brandEn}
                </h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {group.models.map((entry) => (
                    <li key={entry.bike_model_id}>
                      <Link
                        className="flex min-h-11 items-center rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:border-primary hover:text-primary"
                        href={`/model-detail/${entry.bike_model_year_id}`}
                      >
                        {entry.model_name_ko ?? entry.model_name_en}
                        {entry.model_name_ko && entry.model_name_ko !== entry.model_name_en ? (
                          <span className="ml-1 font-normal text-foreground-secondary">{entry.model_name_en}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </details>
    </section>
  </>;
}
