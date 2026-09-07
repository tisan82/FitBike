import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { AppLayout } from "@/components/layout/AppLayout";
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, DEFAULT_TITLE, SITE_ALTERNATE_NAME, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: "%s | 핏바이크" },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  verification: {
    other: {
      "naver-site-verification": "06ddda2f170be353a9574cc8f12ba29d40b72a98",
    },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: DEFAULT_OG_IMAGE, alt: "FitBike 오토바이 정보 서비스" }],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "에스와이아이",
        alternateName: [SITE_NAME, SITE_ALTERNATE_NAME],
        url: SITE_URL,
        logo: absoluteUrl(DEFAULT_OG_IMAGE),
        description: "오토바이 모델·연식 기준 부품 규격 및 바이크 관리 정보 서비스 핏바이크(FitBike) 운영 사업자",
        email: "mailto:changsoo_j@naver.com",
        telephone: "+82-10-2640-0761",
        address: {
          "@type": "PostalAddress",
          streetAddress: "영중로 96 2층 1호",
          addressLocality: "영등포구",
          addressRegion: "서울특별시",
          postalCode: "07246",
          addressCountry: "KR",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAME,
        url: SITE_URL,
        description: DEFAULT_DESCRIPTION,
        inLanguage: "ko-KR",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
  return <html className="h-full antialiased" lang="ko"><body className="min-h-full"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /><Providers><AppLayout>{children}</AppLayout></Providers></body></html>;
}
