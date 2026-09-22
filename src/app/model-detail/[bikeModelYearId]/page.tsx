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
function description(data: ModelDetailData) {
  const identityDetails = [
    data.engineCc !== null && `${Math.round(data.engineCc)}cc`,
    data.generationName,
    data.frameCode && `프레임 ${data.frameCode}`,
  ].filter(Boolean);
  const serviceSpecs = [
    data.frontTire.fullSize && `앞 타이어 ${data.frontTire.fullSize}`,
    data.rearTire.fullSize && `뒤 타이어 ${data.rearTire.fullSize}`,
    data.batteryStandardCode && `배터리 ${data.batteryStandardCode}`,
    data.engineOilSae && `엔진오일 ${data.engineOilSae}`,
  ].filter(Boolean);
  const details = [...identityDetails, ...serviceSpecs].slice(0, 5);
  return `${identity(data)}의 제원·타이어·배터리·브레이크·엔진오일 정보${details.length ? `. ${details.join(", ")}` : ""}를 확인하세요.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseId((await params).bikeModelYearId);
  if (id === null) return { title: "모델 연식 정보를 찾을 수 없음", robots: { index: false, follow: false } };
  try {
    const data = await getCachedModelDetail(id); const name = identity(data); const desc = description(data); const path = `/model-detail/${id}`; const image = getStoragePublicUrl(data.imageUrl) ?? absoluteUrl(DEFAULT_OG_IMAGE);
    return { title: `${name} 제원·타이어·배터리·브레이크·엔진오일`, description: desc, alternates: { canonical: path }, robots: { index: true, follow: true }, openGraph: { type: "website", siteName: SITE_NAME, locale: "ko_KR", title: `${name} 제원·타이어·배터리·브레이크·엔진오일 | FitBike`, description: desc, url: path, images: [{ url: image, alt: `${name} 모델 이미지` }] }, twitter: { card: "summary_large_image", title: `${name} 제원·타이어·배터리·브레이크·엔진오일 | FitBike`, description: desc, images: [image] } };
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
  const additionalProperty = [
    data.frontTire.fullSize && { "@type": "PropertyValue", name: "앞 타이어 규격", value: data.frontTire.fullSize },
    data.rearTire.fullSize && { "@type": "PropertyValue", name: "뒤 타이어 규격", value: data.rearTire.fullSize },
    data.batteryStandardCode && { "@type": "PropertyValue", name: "배터리 규격", value: data.batteryStandardCode },
    data.batteryVoltage && { "@type": "PropertyValue", name: "배터리 전압", value: data.batteryVoltage },
    data.frontBrakeSpec && { "@type": "PropertyValue", name: "앞 브레이크", value: data.frontBrakeSpec },
    data.rearBrakeSpec && { "@type": "PropertyValue", name: "뒤 브레이크", value: data.rearBrakeSpec },
    data.engineCc !== null && { "@type": "PropertyValue", name: "배기량", value: `${Math.round(data.engineCc)}cc` },
    data.category && { "@type": "PropertyValue", name: "차종", value: data.category },
    data.generationName && { "@type": "PropertyValue", name: "세대", value: data.generationName },
    data.frameCode && { "@type": "PropertyValue", name: "프레임 코드", value: data.frameCode },
    data.trimName && { "@type": "PropertyValue", name: "트림", value: data.trimName },
    data.variantName && { "@type": "PropertyValue", name: "사양", value: data.variantName },
    data.engineType && { "@type": "PropertyValue", name: "엔진 형식", value: data.engineType },
    data.coolingType && { "@type": "PropertyValue", name: "냉각 방식", value: data.coolingType },
    data.fuelSystem && { "@type": "PropertyValue", name: "연료 공급 방식", value: data.fuelSystem },
    data.transmissionType && { "@type": "PropertyValue", name: "변속기", value: data.transmissionType },
    data.maxPowerPs !== null && { "@type": "PropertyValue", name: "최고출력", value: `${data.maxPowerPs} PS` },
    data.maxTorqueNm !== null && { "@type": "PropertyValue", name: "최대토크", value: `${data.maxTorqueNm} Nm` },
    data.seatHeightMm !== null && { "@type": "PropertyValue", name: "시트고", value: `${data.seatHeightMm} mm` },
    data.curbWeightKg !== null && { "@type": "PropertyValue", name: "차량중량", value: `${data.curbWeightKg} kg` },
    data.fuelCapacityL !== null && { "@type": "PropertyValue", name: "연료탱크", value: `${data.fuelCapacityL} L` },
    data.priceMinKrw !== null && { "@type": "PropertyValue", name: "국내 가격(최소)", value: `${data.priceMinKrw} KRW` },
    data.priceMaxKrw !== null && { "@type": "PropertyValue", name: "국내 가격(최대)", value: `${data.priceMaxKrw} KRW` },
    data.engineOilChangeL !== null && { "@type": "PropertyValue", name: "엔진오일 교환량", value: `${data.engineOilChangeL} L` },
    data.engineOilFilterChangeL !== null && { "@type": "PropertyValue", name: "필터 교환 시 엔진오일", value: `${data.engineOilFilterChangeL} L` },
    data.engineOilTotalL !== null && { "@type": "PropertyValue", name: "엔진오일 총량", value: `${data.engineOilTotalL} L` },
    data.engineOilSae && { "@type": "PropertyValue", name: "엔진오일 SAE", value: data.engineOilSae },
    data.engineOilApi && { "@type": "PropertyValue", name: "엔진오일 API", value: data.engineOilApi },
    data.engineOilJaso && { "@type": "PropertyValue", name: "엔진오일 JASO", value: data.engineOilJaso },
  ].filter(Boolean);
  const jsonLd = { "@context": "https://schema.org", "@graph": [
    { "@type": "Motorcycle", "@id": `${url}#motorcycle`, name, brand: { "@type": "Brand", name: data.brandNameKo ?? data.brandNameEn }, model: data.modelNameKo ?? data.modelNameEn, description: description(data), url, ...(image ? { image: [image] } : {}), additionalProperty },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "FitBike", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "내 바이크 찾기", item: `${SITE_URL}/bike-selector` },
      { "@type": "ListItem", position: 3, name, item: url },
    ] },
  ] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /><ModelDetail bikeModelYearId={id} initialData={data} /></>;
}
