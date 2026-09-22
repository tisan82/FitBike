import type { Metadata } from "next";
import Link from "next/link";
import { findActiveBrandsForSeo, findActiveModelsForSeo } from "@/repositories/model-detail.repository";
import { modelSeoPath, toSeoSlug } from "@/lib/seo/motorcycle";

export const metadata: Metadata = { title: "오토바이 브랜드·모델 찾기", description: "FitBike에 등록된 오토바이 브랜드와 모델을 찾아 연식별 제원과 타이어·배터리·브레이크 규격을 확인하세요.", alternates: { canonical: "/motorcycles" } };

export default async function MotorcyclesPage() {
  const [brands, models] = await Promise.all([findActiveBrandsForSeo(), findActiveModelsForSeo()]);
  return <main className="mx-auto w-full max-w-5xl space-y-8 px-5 py-8 sm:py-14"><header><p className="text-sm font-semibold text-primary">MOTORCYCLES</p><h1 className="mt-1 text-3xl font-bold">오토바이 브랜드·모델</h1><p className="mt-3 text-base leading-7 text-foreground-secondary">브랜드와 모델을 선택해 등록 연식과 연식별 부품 규격을 확인하세요.</p></header><div className="space-y-8">{brands.map((brand) => { const brandModels=models.filter((m)=>m.brand_id===brand.brand_id); if(!brandModels.length) return null; const brandName=brand.brand_ko??brand.brand_en; return <section key={brand.brand_id} id={toSeoSlug(brand.brand_en)}><h2 className="text-xl font-bold">{brandName}</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">{brandModels.map((model)=><Link key={model.bike_model_id} className="rounded-xl border border-border bg-surface p-4 font-semibold hover:border-primary hover:text-primary" href={modelSeoPath(brand.brand_en,model.model_name_en)}>{model.model_name_ko??model.model_name_en}</Link>)}</div></section>; })}</div></main>;
}
