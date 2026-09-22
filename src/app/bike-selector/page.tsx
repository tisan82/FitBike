import type { Metadata } from "next";
import Link from "next/link";
import { BikeSelector } from "@/features/bike-selector";
import { findModelSearchEntries } from "@/repositories/model-detail.repository";
export const metadata: Metadata = { title: "내 바이크 선택", description: "오토바이 브랜드, 모델, 연식을 순서대로 선택해 해당 바이크의 타이어, 배터리, 브레이크 규격을 확인하세요.", alternates: { canonical: "/bike-selector" } };
export default async function BikeSelectorPage() {
  const entries = await findModelSearchEntries();
  const latestByModel = Array.from(new Map(entries.map((entry) => [entry.bike_model_id, entry])).values());
  return <>
    <BikeSelector />
    <section className="mx-auto w-full max-w-4xl px-5 pb-12" aria-labelledby="model-directory-heading">
      <h2 id="model-directory-heading" className="text-xl font-bold">등록된 바이크 모델</h2>
      <p className="mt-2 text-sm leading-6 text-foreground-secondary">브랜드와 모델명을 선택하면 현재 등록된 최신 연식 상세로 이동합니다.</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {latestByModel.map((entry) => <li key={entry.bike_model_id}>
          <Link className="flex min-h-11 items-center rounded-xl border border-border px-4 py-3 text-sm font-semibold hover:border-primary hover:text-primary" href={`/model-detail/${entry.bike_model_year_id}`}>
            {entry.brand_ko ?? entry.brand_en} {entry.model_name_ko ?? entry.model_name_en}
          </Link>
        </li>)}
      </ul>
    </section>
  </>;
}
