import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModelDetail } from "@/features/model-detail";
import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { getCachedModelDetail } from "@/services/model-detail.loader";
import { ModelDetailNotFoundError } from "@/services/model-detail.service";

type Props = { params: Promise<{ bikeModelYearId: string }> };
function parseId(value: string) { if (!/^\d+$/.test(value)) return null; const id = Number(value); return Number.isSafeInteger(id) && id > 0 ? id : null; }
function identity(data: ModelDetailData) { return `${data.brandNameKo ?? data.brandNameEn} ${data.modelNameKo ?? data.modelNameEn} ${data.yearRangeLabel}`; }
function description(data: ModelDetailData) { const specs = [data.frontTire.fullSize && `앞 타이어 ${data.frontTire.fullSize}`, data.rearTire.fullSize && `뒤 타이어 ${data.rearTire.fullSize}`, data.batteryStandardCode && `배터리 ${data.batteryStandardCode}`].filter(Boolean); return `${identity(data)}의 타이어·배터리·브레이크 규격${specs.length ? `(${specs.join(", ")})` : ""}과 연식 주요 변경 정보를 확인하세요.`; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseId((await params).bikeModelYearId);
  if (id === null) return { title: "모델 연식 정보를 찾을 수 없음", robots: { index: false, follow: false } };
  try {
    const data = await getCachedModelDetail(id); const name = identity(data); const desc = description(data); const path = `/model-detail/${id}`; const image = getStoragePublicUrl(data.imageUrl) ?? absoluteUrl(DEFAULT_OG_IMAGE);
    return { title: `${name} 타이어·배터리·브레이크 규격`, description: desc, alternates: { canonical: path }, robots: { index: true, follow: true }, openGraph: { type: "website", siteName: SITE_NAME, locale: "ko_KR", title: `${name} 타이어·배터리·브레이크 규격 | FitBike`, description: desc, url: path, images: [{ url: image, alt: `${name} 모델 이미지` }] }, twitter: { card: "summary_large_image", title: `${name} 타이어·배터리·브레이크 규격 | FitBike`, description: desc, images: [image] } };
  } catch (error) {
    if (error instanceof ModelDetailNotFoundError) return { title: "모델 연식 정보를 찾을 수 없음", robots: { index: false, follow: false } };
    return { title: "모델 연식 정보", robots: { index: false, follow: true } };
  }
}

export default async function ModelDetailPage({ params }: Props) {
  const id = parseId((await params).bikeModelYearId); if (id === null) notFound();
  let data: ModelDetailData;
  try { data = await getCachedModelDetail(id); }
  catch (error) { if (error instanceof ModelDetailNotFoundError) notFound(); throw error; }
  const name = identity(data); const url = `${SITE_URL}/model-detail/${id}`; const image = getStoragePublicUrl(data.imageUrl);
  const motorcycle = { "@context": "https://schema.org", "@type": "Motorcycle", name, brand: { "@type": "Brand", name: data.brandNameKo ?? data.brandNameEn }, model: data.modelNameKo ?? data.modelNameEn, description: description(data), url, ...(image ? { image } : {}) };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(motorcycle).replace(/</g, "\\u003c") }} /><ModelDetail bikeModelYearId={id} initialData={data} /></>;
}
