import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findActiveBrandsForSeo, findActiveModelsForSeo, findModelYearOptions } from "@/repositories/model-detail.repository";
import { modelSeoPath, toSeoSlug } from "@/lib/seo/motorcycle";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";

type Props = { params: Promise<{ brand: string; model: string }> };

async function resolveModel(brandSlug: string, modelSlug: string) {
  const [brands, models] = await Promise.all([findActiveBrandsForSeo(), findActiveModelsForSeo()]);
  const brand = brands.find((item) => toSeoSlug(item.brand_en) === brandSlug);
  if (!brand) return null;
  const model = models.filter((item) => item.brand_id === brand.brand_id).find((item) => toSeoSlug(item.model_name_en) === modelSlug);
  if (!model) return null;
  const years = await findModelYearOptions(model.bike_model_id);
  return { brand, model, years };
}
function names(data: NonNullable<Awaited<ReturnType<typeof resolveModel>>>) {
  return { brand: data.brand.brand_ko ?? data.brand.brand_en, model: data.model.model_name_ko ?? data.model.model_name_en };
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const paramsValue = await params; const data = await resolveModel(paramsValue.brand, paramsValue.model);
  if (!data) return { title: "바이크 모델을 찾을 수 없음", robots: { index: false, follow: false } };
  const name = names(data); const path = modelSeoPath(data.brand.brand_en, data.model.model_name_en);
  const description = name.brand + " " + name.model + "의 국내 등록 연식과 연식별 타이어·배터리·브레이크 규격, 주요 제원을 확인하세요.";
  return { title: name.brand + " " + name.model + " 연식·제원·타이어·배터리·브레이크", description, alternates: { canonical: path }, robots: { index: true, follow: true }, openGraph: { type: "website", siteName: SITE_NAME, locale: "ko_KR", title: name.brand + " " + name.model + " 모델 정보 | FitBike", description, url: path } };
}
export default async function MotorcycleModelPage({ params }: Props) {
  const paramsValue = await params; const data = await resolveModel(paramsValue.brand, paramsValue.model); if (!data) notFound();
  const name = names(data); const canonicalPath = modelSeoPath(data.brand.brand_en, data.model.model_name_en);
  if (canonicalPath !== "/motorcycles/" + paramsValue.brand + "/" + paramsValue.model) notFound();
  const brandPath = "/motorcycles/" + toSeoSlug(data.brand.brand_en);
  const jsonLd = { "@context": "https://schema.org", "@graph": [
    { "@type": "Motorcycle", "@id": SITE_URL + canonicalPath + "#motorcycle", name: name.brand + " " + name.model, brand: { "@type": "Brand", name: name.brand }, model: name.model, url: SITE_URL + canonicalPath },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "FitBike", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "바이크 모델", item: SITE_URL + "/motorcycles" },
      { "@type": "ListItem", position: 3, name: name.brand, item: SITE_URL + brandPath },
      { "@type": "ListItem", position: 4, name: name.brand + " " + name.model, item: SITE_URL + canonicalPath }
    ] }
  ] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /><main className="mx-auto w-full max-w-5xl space-y-8 px-5 py-8 sm:py-14">
    <nav aria-label="경로" className="text-sm text-foreground-secondary"><Link className="hover:text-primary" href="/motorcycles">바이크 모델</Link><span aria-hidden="true"> / </span><Link className="hover:text-primary" href={brandPath}>{name.brand}</Link></nav>
    <header className="space-y-3"><p className="text-sm font-semibold text-primary">{name.brand}</p><h1 className="text-3xl font-bold tracking-tight text-foreground">{name.brand} {name.model}</h1><p className="max-w-3xl text-base leading-7 text-foreground-secondary">{data.model.model_summary ?? name.brand + " " + name.model + "의 국내 등록 연식과 연식별 제원, 타이어·배터리·브레이크 규격을 확인할 수 있습니다."}</p></header>
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-7"><h2 className="text-xl font-bold">모델 기본 정보</h2><dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">{data.model.engine_cc !== null ? <div><dt className="text-sm text-foreground-secondary">배기량</dt><dd className="mt-1 font-semibold">{Math.round(data.model.engine_cc)}cc</dd></div> : null}{data.model.default_category ? <div><dt className="text-sm text-foreground-secondary">카테고리</dt><dd className="mt-1 font-semibold">{data.model.default_category}</dd></div> : null}<div><dt className="text-sm text-foreground-secondary">등록 연식 구간</dt><dd className="mt-1 font-semibold">{data.years.length}개</dd></div></dl></section>
    <section className="space-y-4"><div><p className="text-sm font-semibold text-primary">YEAR</p><h2 className="mt-1 text-xl font-bold">연식을 선택하세요</h2></div><div className="grid gap-3 sm:grid-cols-2">{data.years.map((year) => <Link key={year.bikeModelYearId} className="rounded-2xl border border-border bg-surface p-5 transition hover:border-primary" href={"/model-detail/" + year.bikeModelYearId}><strong className="text-lg">{name.brand} {name.model} {year.yearRangeLabel}</strong><p className="mt-2 text-sm leading-6 text-foreground-secondary">타이어·배터리·브레이크 규격과 연식별 상세 제원을 확인합니다.</p></Link>)}</div></section>
    <section className="rounded-2xl bg-surface-secondary p-5 sm:p-7"><h2 className="text-xl font-bold">{name.model} 부품·관리 정보</h2><p className="mt-2 text-base leading-7 text-foreground-secondary">정확한 부품 규격은 같은 모델이라도 연식에 따라 달라질 수 있습니다. 위에서 실제 바이크 연식을 선택한 뒤 등록된 규격을 확인하세요.</p></section>
  </main></>;
}