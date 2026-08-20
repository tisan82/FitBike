import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TireModelDetail } from "@/features/tire-detail";
import type { TireModelDetailData } from "@/features/tire-detail/types/tire-detail.types";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { getCachedTireModelDetail } from "@/services/tire-model-detail.loader";
import { TireModelNotFoundError } from "@/services/tire-detail.service";

type Props = {
  params: Promise<{ tireModelKey: string }>;
};

function parseTireModelKey(value: string) {
  return /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tireModelKey = parseTireModelKey((await params).tireModelKey);
  if (!tireModelKey) notFound();

  try {
    const model = await getCachedTireModelDetail(tireModelKey);
    const title = `${model.brandName} ${model.displayName}`;
    const description = model.summary ?? model.description ?? `${title}의 특징과 판매 규격을 확인하세요.`;
    const path = `/tire-detail/model/${encodeURIComponent(model.tireModelKey)}`;
    const image = getStoragePublicUrl(model.mainImageUrl) ?? absoluteUrl(DEFAULT_OG_IMAGE);
    return {
      title,
      description,
      alternates: { canonical: path },
      robots: { index: true, follow: true },
      openGraph: {
        type: "website",
        locale: "ko_KR",
        siteName: SITE_NAME,
        title: `${title} | FitBike`,
        description,
        url: path,
        images: [{ url: image, alt: `${title} 타이어 모델` }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} | FitBike`,
        description,
        images: [image],
      },
    };
  } catch (error) {
    if (error instanceof TireModelNotFoundError) {
      notFound();
    }
    return { title: "타이어 모델 상세", robots: { index: false, follow: true } };
  }
}

export default async function TireModelDetailPage({ params }: Props) {
  const tireModelKey = parseTireModelKey((await params).tireModelKey);
  if (!tireModelKey) notFound();

  let model: TireModelDetailData | null = null;
  try {
    model = await getCachedTireModelDetail(tireModelKey);
  } catch (error) {
    if (!(error instanceof TireModelNotFoundError)) throw error;
  }
  if (!model) notFound();

  const title = `${model.brandName} ${model.displayName}`;
  const image = getStoragePublicUrl(model.mainImageUrl);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: title,
    brand: { "@type": "Brand", name: model.brandName },
    model: model.modelName,
    description: model.summary ?? model.description ?? undefined,
    url: `${SITE_URL}/tire-detail/model/${encodeURIComponent(model.tireModelKey)}`,
    ...(image ? { image } : {}),
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />
      <TireModelDetail model={model} />
    </>
  );
}
