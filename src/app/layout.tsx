import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { AppLayout } from "@/components/layout/AppLayout";
import { DEFAULT_DESCRIPTION, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import "./globals.css";

export const metadata: Metadata = { metadataBase: new URL(SITE_URL), title: { default: SITE_NAME, template: "%s | FitBike" }, description: DEFAULT_DESCRIPTION, applicationName: SITE_NAME, openGraph: { type: "website", locale: "ko_KR", siteName: SITE_NAME, title: SITE_NAME, description: DEFAULT_DESCRIPTION, url: SITE_URL, images: [{ url: DEFAULT_OG_IMAGE, alt: "FitBike" }] }, twitter: { card: "summary", title: SITE_NAME, description: DEFAULT_DESCRIPTION, images: [DEFAULT_OG_IMAGE] }, robots: { index: true, follow: true } };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const jsonLd = { "@context": "https://schema.org", "@graph": [{ "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: SITE_NAME, url: SITE_URL, logo: absoluteUrl(DEFAULT_OG_IMAGE) }, { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL, publisher: { "@id": `${SITE_URL}/#organization` } }] };
  return <html className="h-full antialiased" lang="ko"><body className="min-h-full"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} /><Providers><AppLayout>{children}</AppLayout></Providers></body></html>;
}
