import type { Metadata } from "next";

import { PoweroadBatteryProductList } from "@/features/battery-product-list";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { getCachedActiveBatteryProductsByBrandName } from "@/services/battery-product-list.loader";

const title = "POWEROAD 오토바이 배터리 전체 상품";
const description = "POWEROAD 오토바이 배터리의 규격, 전압, 용량, CCA와 호환 바이크 모델·연식을 확인하세요.";
const path = "/battery-products/poweroad";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: path },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    title,
    description,
    url: path,
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: { card: "summary", title, description, images: [DEFAULT_OG_IMAGE] },
};

export default async function PoweroadBatteryProductsPage() {
  const products = await getCachedActiveBatteryProductsByBrandName("POWEROAD");
  const url = `${SITE_URL}${path}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#collection`,
        name: title,
        description,
        url,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: products.length,
          itemListElement: products.map((product, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: `${product.brandName} ${product.specCode}`,
            url: `${SITE_URL}/battery-detail/${product.batteryProductId}`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "핏바이크", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "POWEROAD 배터리", item: url },
        ],
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <PoweroadBatteryProductList products={products} />
    </>
  );
}
