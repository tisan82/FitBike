import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ModelDetail } from "@/features/model-detail";
import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { getCachedLatestModelDetailBySlugs } from "@/services/model-detail.loader";
import { ModelDetailNotFoundError } from "@/services/model-detail.service";

type Props = { params: Promise<{ brandSlug: string; modelSlug: string }> };

function identity(data: ModelDetailData) {
  return `${data.brandNameKo ?? data.brandNameEn} ${data.modelNameKo ?? data.modelNameEn}`;
}

function description(data: ModelDetailData) {
  const specs = [
    data.frontTire.fullSize && `앞 타이어 ${data.frontTire.fullSize}`,
    data.rearTire.fullSize && `뒤 타이어 ${data.rearTire.fullSize}`,
    data.batteryStandardCode && `배터리 ${data.batteryStandardCode}`,
  ].filter(Boolean);
  return `${identity(data)}의 최신 등록 연식 ${data.yearRangeLabel} 타이어·배터리·브레이크 규격${specs.length ? `(${specs.join(", ")})` : ""}을 확인하고 다른 연식을 선택하세요.`;
}

async function load(params: Props["params"]) {
  const { brandSlug, modelSlug } = await params;
  return getCachedLatestModelDetailBySlugs(brandSlug, modelSlug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const data = await load(params);
    const name = identity(data);
    const desc = description(data);
    const { brandSlug, modelSlug } = await params;
    const path = `/motorcycles/${brandSlug}/${modelSlug}`;
    const image = getStoragePublicUrl(data.imageUrl) ?? absoluteUrl(DEFAULT_OG_IMAGE);

    return {
      title: `${name} 타이어·배터리·브레이크 규격`,
      description: desc,
      alternates: { canonical: path },
      robots: { index: true, follow: true },
      openGraph: {
        type: "website",
        siteName: SITE_NAME,
        locale: "ko_KR",
        title: `${name} 타이어·배터리·브레이크 규격 | FitBike`,
        description: desc,
        url: path,
        images: [{ url: image, alt: `${name} 모델 이미지` }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${name} 타이어·배터리·브레이크 규격 | FitBike`,
        description: desc,
        images: [image],
      },
    };
  } catch (error) {
    if (error instanceof ModelDetailNotFoundError) {
      return { title: "모델 정보를 찾을 수 없음", robots: { index: false, follow: false } };
    }
    return { title: "모델 정보", robots: { index: false, follow: true } };
  }
}

export default async function MotorcycleModelPage({ params }: Props) {
  let data: ModelDetailData;
  try {
    data = await load(params);
  } catch (error) {
    if (error instanceof ModelDetailNotFoundError) notFound();
    throw error;
  }

  const { brandSlug, modelSlug } = await params;
  const path = `/motorcycles/${brandSlug}/${modelSlug}`;
  const url = `${SITE_URL}${path}`;
  const name = identity(data);
  const image = getStoragePublicUrl(data.imageUrl);
  const additionalProperty = [
    { "@type": "PropertyValue", name: "기본 표시 연식", value: data.yearRangeLabel },
    data.frontTire.fullSize && { "@type": "PropertyValue", name: "앞 타이어 규격", value: data.frontTire.fullSize },
    data.rearTire.fullSize && { "@type": "PropertyValue", name: "뒤 타이어 규격", value: data.rearTire.fullSize },
    data.batteryStandardCode && { "@type": "PropertyValue", name: "배터리 규격", value: data.batteryStandardCode },
    data.frontBrakeSpec && { "@type": "PropertyValue", name: "앞 브레이크", value: data.frontBrakeSpec },
    data.rearBrakeSpec && { "@type": "PropertyValue", name: "뒤 브레이크", value: data.rearBrakeSpec },
  ].filter(Boolean);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Motorcycle",
    "@id": `${url}#motorcycle`,
    name,
    brand: { "@type": "Brand", name: data.brandNameKo ?? data.brandNameEn },
    model: data.modelNameKo ?? data.modelNameEn,
    identifier: data.modelKey,
    description: description(data),
    url,
    ...(image ? { image: [image] } : {}),
    additionalProperty,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <ModelDetail
        bikeModelYearId={data.bikeModelYearId}
        initialData={data}
        modelPagePath={path}
      />
    </>
  );
}
