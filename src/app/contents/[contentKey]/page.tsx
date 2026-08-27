import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentBlockRenderer } from "@/features/content";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { getPublishedContentByKey } from "@/services/content.service";

type Props = { params: Promise<{ contentKey: string }> };

const labels = {
  MAINTENANCE: "점검/관리",
  DIY: "교체/DIY",
  PARTS_GUIDE: "부품 이해",
  MODEL_GUIDE: "모델 정보",
} as const;

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
      ...(hero && content.contentType !== "MODEL_GUIDE"
        ? { images: [{ url: hero, alt: content.title }] }
        : {}),
    },
  };
}

export default async function ContentDetailPage({ params }: Props) {
  const contentKey = validContentKey((await params).contentKey);
  if (!contentKey) notFound();
  const content = await getPublishedContentByKey(contentKey);
  if (!content) notFound();

  const storedHero = getStoragePublicUrl(content.heroImageStoragePath, "content-assets");
  const hero = content.contentType === "MODEL_GUIDE" ? null : storedHero;
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
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-5 sm:py-14">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />

      <nav aria-label="콘텐츠 탐색" className="mb-7">
        <Link className="inline-flex min-h-11 items-center text-sm font-bold text-primary hover:text-primary-hover" href="/contents">
          ← 바이크 가이드
        </Link>
      </nav>

      <article className="mx-auto max-w-3xl">
        <header className="border-b border-border pb-8">
          <p className="text-sm font-bold text-primary">{labels[content.contentType]}</p>
          <h1 className="mt-3 text-2xl font-bold leading-9 sm:text-3xl sm:leading-10">{content.title}</h1>
          <p className="mt-5 text-base leading-7 text-foreground-secondary sm:text-lg sm:leading-8">{content.summary}</p>
          <p className="mt-5 text-sm leading-6 text-foreground-secondary">
            이 글은 정비·관리 판단에 필요한 정보를 이해하기 쉽게 정리한 가이드입니다. 모델별 실제 제원이나 정비 기준은 제조사 공식 자료를 우선 확인하세요.
          </p>
        </header>

        {hero ? (
          <figure className="mt-8">
            <Image
              alt={content.title}
              className="aspect-video w-full rounded-2xl object-cover"
              height={675}
              priority
              src={hero}
              unoptimized
              width={1200}
            />
          </figure>
        ) : null}

        <div className="mt-10 sm:mt-12">
          <ContentBlockRenderer blocks={content.bodyBlocks} />
        </div>

        <footer className="mt-14 border-t border-border pt-7">
          <p className="text-base leading-7 text-foreground-secondary">
            다른 점검·관리 방법이나 부품 정보를 찾고 있다면 바이크 가이드에서 검색해 보세요.
          </p>
          <Link className="mt-4 inline-flex min-h-11 items-center font-bold text-primary hover:text-primary-hover" href="/contents">
            다른 가이드 찾아보기 →
          </Link>
        </footer>
      </article>
    </main>
  );
}
