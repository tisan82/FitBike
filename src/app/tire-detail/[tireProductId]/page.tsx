import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TireDetail } from "@/features/tire-detail";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import {
  getTireProductDetail,
  TireProductNotFoundError,
} from "@/services/tire-detail.service";

type Props = {
  params: Promise<{ tireProductId: string }>;
};

function parseTireProductId(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function positionLabel(value: string | null) {
  if (value === "FRONT") return "앞 타이어";
  if (value === "REAR") return "뒤 타이어";
  if (value === "BOTH") return "앞·뒤 공용 타이어";
  return "오토바이 타이어";
}

function tireName(product: Awaited<ReturnType<typeof getTireProductDetail>>) {
  const modelName = product.model?.displayName ?? product.productName;
  return `${product.brandName} ${modelName}${product.tireSizeFull ? ` ${product.tireSizeFull}` : ""}`;
}

function tireDescription(product: Awaited<ReturnType<typeof getTireProductDetail>>) {
  const name = tireName(product);
  const details = [
    positionLabel(product.positionType),
    product.loadIndex !== null && product.speedIndex ? `하중 ${product.loadIndex} / 속도 ${product.speedIndex}` : null,
    product.tubeType,
  ].filter(Boolean);
  return `${name} 규격${details.length ? `(${details.join(", ")})` : ""}과 호환되는 오토바이 모델·연식을 확인하세요.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseTireProductId((await params).tireProductId);
  if (id === null) return { title: "타이어 상품을 찾을 수 없음", robots: { index: false, follow: false } };

  try {
    const product = await getTireProductDetail(id);
    const name = tireName(product);
    const description = tireDescription(product);
    const path = `/tire-detail/${id}`;
    const image = getStoragePublicUrl(product.model?.mainImageUrl) ?? absoluteUrl(DEFAULT_OG_IMAGE);
    return {
      title: `${name} 오토바이 타이어 규격·호환 모델`,
      description,
      alternates: { canonical: path },
      robots: { index: true, follow: true },
      openGraph: {
        type: "website",
        siteName: SITE_NAME,
        locale: "ko_KR",
        title: `${name} 오토바이 타이어 규격·호환 모델 | FitBike`,
        description,
        url: path,
        images: [{ url: image, alt: `${name} 타이어` }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${name} 오토바이 타이어 규격·호환 모델 | FitBike`,
        description,
        images: [image],
      },
    };
  } catch (error) {
    if (error instanceof TireProductNotFoundError) {
      return { title: "타이어 상품을 찾을 수 없음", robots: { index: false, follow: false } };
    }
    return { title: "오토바이 타이어 상품", robots: { index: false, follow: true } };
  }
}

export default async function TireDetailPage({ params }: Props) {
  const id = parseTireProductId((await params).tireProductId);
  if (id === null) notFound();

  let product: Awaited<ReturnType<typeof getTireProductDetail>>;
  try {
    product = await getTireProductDetail(id);
  } catch (error) {
    if (error instanceof TireProductNotFoundError) notFound();
    throw error;
  }

  const name = tireName(product);
  const url = `${SITE_URL}/tire-detail/${id}`;
  const image = getStoragePublicUrl(product.model?.mainImageUrl);
  const additionalProperty = [
    product.tireSizeFull && { "@type": "PropertyValue", name: "타이어 규격", value: product.tireSizeFull },
    product.positionType && { "@type": "PropertyValue", name: "장착 위치", value: positionLabel(product.positionType) },
    product.loadIndex !== null && { "@type": "PropertyValue", name: "하중 지수", value: product.loadIndex },
    product.speedIndex && { "@type": "PropertyValue", name: "속도 등급", value: product.speedIndex },
    product.tubeType && { "@type": "PropertyValue", name: "튜브 타입", value: product.tubeType },
  ].filter(Boolean);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${url}#product`,
        name,
        description: tireDescription(product),
        sku: product.tireProductKey,
        brand: { "@type": "Brand", name: product.brandName },
        url,
        ...(image ? { image: [image] } : {}),
        additionalProperty,
        ...(product.price !== null && product.productUrl
          ? {
              offers: {
                "@type": "Offer",
                priceCurrency: "KRW",
                price: product.price,
                url: product.productUrl,
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "FitBike", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "타이어", item: `${SITE_URL}/tire-models/maxxis` },
          { "@type": "ListItem", position: 3, name },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <TireDetail tireProductId={id} />
    </>
  );
}
