import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { ContentBlockRenderer } from "@/features/content";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { getPublishedContentByKey } from "@/services/content.service";

type Props = { params: Promise<{ contentKey: string }> };

const labels = { MAINTENANCE: "점검/관리", DIY: "교체/DIY", PARTS_GUIDE: "부품 규격", MODEL_GUIDE: "모델 가이드" } as const;

function validContentKey(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ? value : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const contentKey = validContentKey((await params).contentKey);
  if (!contentKey) notFound();
  const content = await getPublishedContentByKey(contentKey);
  if (!content) notFound();
  const path = `/contents/${encodeURIComponent(content.contentKey)}`;
  const hero = getStoragePublicUrl(content.heroImageStoragePath, "content-assets");
  return {
    title: content.title,
    description: content.summary,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      title: content.title,
      description: content.summary,
      url: path,
      ...(hero ? { images: [{ url: hero, alt: content.title }] } : {}),
    },
  };
}

export default async function ContentDetailPage({ params }: Props) {
  const contentKey = validContentKey((await params).contentKey);
  if (!contentKey) notFound();
  const content = await getPublishedContentByKey(contentKey);
  if (!content) notFound();
  const hero = getStoragePublicUrl(content.heroImageStoragePath, "content-assets");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: content.title,
    description: content.summary,
    datePublished: content.publishedAt,
    dateModified: content.updatedAt,
    publisher: { "@type": "Organization", name: SITE_NAME },
    url: `${SITE_URL}/contents/${encodeURIComponent(content.contentKey)}`,
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-5 sm:py-14">
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} type="application/ld+json" />
      <article>
        <header>
          <p className="text-sm font-bold text-primary">{labels[content.contentType]}</p>
          <h1 className="mt-2 text-2xl font-bold leading-8 sm:text-3xl sm:leading-10">{content.title}</h1>
          <p className="mt-4 text-base leading-7 text-foreground-secondary">{content.summary}</p>
        </header>
        {hero ? <Image alt={content.title} className="mt-8 aspect-video w-full rounded-2xl object-cover" height={675} priority src={hero} unoptimized width={1200} /> : null}
        <div className="mt-10"><ContentBlockRenderer blocks={content.bodyBlocks} /></div>
      </article>
    </main>
  );
}
