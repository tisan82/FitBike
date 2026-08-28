import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BatteryDetail } from "@/features/battery-detail";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import {
  BatteryProductNotFoundError,
  getBatteryProductDetail,
} from "@/services/battery-detail.service";

type Props = {
  params: Promise<{ batteryProductId: string }>;
};

function parseBatteryProductId(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function batteryName(brandName: string, specCode: string) {
  return `${brandName} ${specCode}`;
}

function batteryDescription(product: Awaited<ReturnType<typeof getBatteryProductDetail>>) {
  const specs = [
    product.voltage && `${product.voltage}V`,
    product.capacityAh !== null ? `${product.capacityAh}Ah` : null,
    product.continuousDischargeCca !== null ? `CCA ${product.continuousDischargeCca}A` : null,
    product.lengthMm !== null && product.widthMm !== null && product.heightMm !== null
      ? `${product.lengthMm}×${product.widthMm}×${product.heightMm}mm`
      : null,
  ].filter(Boolean);
  return `${batteryName(product.brandName, product.specCode)} 오토바이 배터리 규격${specs.length ? `(${specs.join(", ")})` : ""}, 단자 정보와 호환 바이크 모델·연식을 확인하세요.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseBatteryProductId((await params).batteryProductId);
  if (id === null) return { title: "배터리 상품을 찾을 수 없음", robots: { index: false, follow: false } };

  try {
    const product = await getBatteryProductDetail(id);
    const name = batteryName(product.brandName, product.specCode);
    const description = batteryDescription(product);
    const path = `/battery-detail/${id}`;
    const image = getStoragePublicUrl(product.productImageUrl, "battery-assets") ?? absoluteUrl(DEFAULT_OG_IMAGE);
    return {
      title: `${name} 오토바이 배터리 규격·호환 모델`,
      description,
      alternates: { canonical: path },
      robots: { index: true, follow: true },
      openGraph: {
        type: "website",
        siteName: SITE_NAME,
        locale: "ko_KR",
        title: `${name} 오토바이 배터리 규격·호환 모델 | FitBike`,
        description,
        url: path,
        images: [{ url: image, alt: `${name} 배터리` }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${name} 오토바이 배터리 규격·호환 모델 | FitBike`,
        description,
        images: [image],
      },
    };
  } catch (error) {
    if (error instanceof BatteryProductNotFoundError) {
      return { title: "배터리 상품을 찾을 수 없음", robots: { index: false, follow: false } };
    }
    return { title: "오토바이 배터리 상품", robots: { index: false, follow: true } };
  }
}

export default async function BatteryDetailPage({ params }: Props) {
  const id = parseBatteryProductId((await params).batteryProductId);
  if (id === null) notFound();

  let product: Awaited<ReturnType<typeof getBatteryProductDetail>>;
  try {
    product = await getBatteryProductDetail(id);
  } catch (error) {
    if (error instanceof BatteryProductNotFoundError) notFound();
    throw error;
  }

  const name = batteryName(product.brandName, product.specCode);
  const image = getStoragePublicUrl(product.productImageUrl, "battery-assets");
  const url = `${SITE_URL}/battery-detail/${id}`;
  const additionalProperty = [
    product.voltage && { "@type": "PropertyValue", name: "전압", value: `${product.voltage}V` },
    product.capacityAh !== null && { "@type": "PropertyValue", name: "용량", value: `${product.capacityAh}Ah` },
    product.continuousDischargeCca !== null && { "@type": "PropertyValue", name: "CCA", value: `${product.continuousDischargeCca}A` },
    product.terminalPolarity && { "@type": "PropertyValue", name: "단자 극성", value: product.terminalPolarity },
    product.batteryType && { "@type": "PropertyValue", name: "배터리 타입", value: product.batteryType },
  ].filter(Boolean);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${url}#product`,
        name,
        description: batteryDescription(product),
        sku: product.batteryPartKey,
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
          { "@type": "ListItem", position: 2, name: "배터리 상품", item: url },
          { "@type": "ListItem", position: 3, name },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <BatteryDetail batteryProductId={id} />
    </>
  );
}
