import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ContentBlockRenderer, RelatedContentGuides } from "@/features/content";
import { ContentBikeFinderCta } from "@/features/content/components/ContentBikeFinderCta";
import type { ContentBlock } from "@/features/content/types/content.types";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl } from "@/lib/seo/site";
import { getPublishedContentByKey, getPublishedContents, getRelatedBikesByContentId, selectRelatedPublishedContents } from "@/services/content.service";

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

function shouldOptimizeHero(src: string) {
  try {
    const hostname = new URL(src).hostname;
    return hostname === "upload.wikimedia.org" || hostname === "commons.wikimedia.org";
  } catch {
    return false;
  }
}

function metadataDescription(summary: string) {
  const normalized = summary.replace(/\s+/g, " ").trim();
  return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77).trimEnd()}…`;
}

function formatKoreanDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(value));
}

const referenceHeadingPattern = /^(?:확인에\s*)?참고한?\s*(?:공식\s*)?자료$/;

function splitReferenceBlocks(blocks: ContentBlock[]) {
  const referenceIndex = blocks.findIndex(
    (block) => block.type === "heading" && referenceHeadingPattern.test(block.text.trim()),
  );
  if (referenceIndex < 0) return { contentBlocks: blocks, referenceBlocks: [] };
  return {
    contentBlocks: blocks.slice(0, referenceIndex),
    referenceBlocks: blocks.slice(referenceIndex + 1),
  };
}

function referenceItems(blocks: ContentBlock[]) {
  return blocks.flatMap((block) => {
    if (block.type === "bullet_list" || block.type === "numbered_list") return block.items;
    if (block.type === "paragraph") return [block.text];
    return [];
  });
}

function parseReferenceItem(value: string) {
  const markdownLink = value.trim().match(/^\[([^\]]+)]\((https?:\/\/[^\s)]+)\)$/);
  if (markdownLink) return { label: markdownLink[1].trim(), href: markdownLink[2] };

  const url = value.match(/https?:\/\/[^\s]+/i)?.[0];
  if (!url) return { label: value.trim(), href: null };

  const label = value.replace(url, "").replace(/[\s:：–—-]+$/, "").trim();
  return { label: label || "공식 자료", href: url };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const contentKey = validContentKey((await params).contentKey);
  if (!contentKey) notFound();
  const content = await getPublishedContentByKey(contentKey);
  if (!content) notFound();
  const path = `/contents/${encodeURIComponent(content.contentKey)}`;
  const hero = getStoragePublicUrl(content.heroImageStoragePath, "content-assets");
  const image = hero ?? absoluteUrl(DEFAULT_OG_IMAGE);
  const description = metadataDescription(content.summary);
  return {
    title: content.title,
    description,
    alternates: {
      canonical: path,
      types: { "application/rss+xml": [{ title: "FitBike 바이크 가이드", url: "/rss.xml" }] },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      locale: "ko_KR",
      title: `${content.title} | FitBike`,
      description,
      url: path,
      images: [{ url: image, alt: content.title }],
      publishedTime: content.publishedAt,
      modifiedTime: content.updatedAt,
    },
    twitter: {
      card: "summary_large_image",
      title: `${content.title} | FitBike`,
      description,
      images: [image],
    },
  };
}

export default async function ContentDetailPage({ params }: Props) {
  const contentKey = validContentKey((await params).contentKey);
  if (!contentKey) notFound();
  const [content, publishedContents] = await Promise.all([
    getPublishedContentByKey(contentKey),
    getPublishedContents(),
  ]);
  if (!content) notFound();
  const relatedGuides = selectRelatedPublishedContents(content, publishedContents);
  const relatedBikes = await getRelatedBikesByContentId(content.contentId);

  const storedHero = getStoragePublicUrl(content.heroImageStoragePath, "content-assets");
  const hero = content.contentType === "MODEL_GUIDE" ? null : storedHero;
  const { contentBlocks, referenceBlocks } = splitReferenceBlocks(content.bodyBlocks);
  const sources = referenceItems(referenceBlocks).map(parseReferenceItem);
  const url = `${SITE_URL}/contents/${encodeURIComponent(content.contentKey)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: content.title,
        description: content.summary,
        articleSection: labels[content.contentType],
        inLanguage: "ko-KR",
        datePublished: content.publishedAt,
        dateModified: content.updatedAt,
        author: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: SITE_NAME, url: SITE_URL },
        publisher: { "@id": `${SITE_URL}/#organization` },
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        url,
        ...(storedHero ? { image: [storedHero] } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "FitBike", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "바이크 가이드", item: `${SITE_URL}/contents` },
          { "@type": "ListItem", position: 3, name: content.title },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-5 sm:py-14">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        type="application/ld+json"
      />

      <nav aria-label="현재 위치" className="mb-7 flex flex-wrap items-center gap-2 text-sm text-foreground-secondary">
        <Link className="inline-flex min-h-11 items-center font-bold text-primary hover:text-primary-hover" href="/">
          홈
        </Link>
        <span aria-hidden="true">/</span>
        <Link className="inline-flex min-h-11 items-center font-bold text-primary hover:text-primary-hover" href="/contents">
          바이크 가이드
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page" className="line-clamp-1">{content.title}</span>
      </nav>

      <article className="mx-auto max-w-3xl">
        <header className="border-b border-border pb-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <p className="font-bold text-primary">{labels[content.contentType]}</p>
            <span aria-hidden="true" className="text-border">|</span>
            <p className="text-foreground-secondary">등록일 {formatKoreanDate(content.publishedAt)}</p>
          </div>
          <h1 className="mt-3 text-2xl font-bold leading-9 sm:text-3xl sm:leading-10">{content.title}</h1>
          <p className="mt-5 text-base leading-7 text-foreground-secondary sm:text-lg sm:leading-8">{content.summary}</p>
        </header>

        <ContentBikeFinderCta title={content.title} />

        {hero ? (
          <figure className="mt-8">
            <Image
              alt={content.title}
              className="aspect-video w-full rounded-2xl object-cover"
              height={675}
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              src={hero}
              unoptimized={!shouldOptimizeHero(hero)}
              width={1200}
            />
          </figure>
        ) : null}

        <div className="mt-10 sm:mt-12">
          <ContentBlockRenderer blocks={contentBlocks} />
          {sources.length ? (
            <details className="group mt-10 rounded-2xl border border-border bg-surface">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold marker:content-none sm:px-6 [&::-webkit-details-marker]:hidden">
                <span>참고 공식 자료</span>
                <span aria-hidden="true" className="text-xl font-normal text-primary transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="border-t border-border px-5 py-5 sm:px-6">
                <ul className="space-y-3 text-base leading-7 text-foreground-secondary">
                  {sources.map((source, index) => (
                    <li className="flex gap-3" key={`${source.label}-${index}`}>
                      <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      {source.href ? (
                        <a
                          className="font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:text-primary-hover"
                          href={source.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {source.label}
                        </a>
                      ) : <span>{source.label}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}
          {relatedBikes.length ? (
            <section className="mt-7 rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="related-bike-heading">
              <h2 id="related-bike-heading" className="text-lg font-bold">관련 모델·연식 정보</h2>
              <p className="mt-2 text-sm leading-6 text-foreground-secondary">이 콘텐츠와 연결된 바이크의 최신 연식 상세에서 제원과 부품 규격을 확인할 수 있습니다.</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {relatedBikes.map((bike) => (
                  <li key={bike.bikeModelId}>
                    <Link className="flex min-h-12 items-center justify-between rounded-xl border border-border px-4 py-3 font-bold text-foreground transition hover:border-primary hover:text-primary" href={`/model-detail/${bike.bikeModelYearId}`}>
                      <span>{bike.brandNameKo ?? bike.brandNameEn} {bike.modelNameKo ?? bike.modelNameEn} 모델·연식 상세</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <aside className="mt-5 rounded-2xl bg-surface-secondary px-5 py-4 text-sm leading-6 text-foreground-secondary sm:px-6">
            이 콘텐츠는 정비·관리 판단을 돕는 가이드입니다. 모델별 실제 제원과 정비 기준은 제조사 공식 자료를 우선 확인하세요.
          </aside>
          <section className="mt-7 rounded-2xl border border-border bg-surface p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
            <div>
              <h2 className="text-lg font-bold">전문 점검이 필요하신가요?</h2>
              <p className="mt-2 text-sm leading-6 text-foreground-secondary">상태를 직접 판단하기 어렵거나 전문 확인이 필요한 신호가 보이면 주변 정비소에 증상과 이동 방법을 문의하세요.</p>
            </div>
            <Link className="mt-4 inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground transition hover:bg-primary-hover sm:mt-0" href="/shops">
              주변 정비소 찾기
            </Link>
          </section>
        </div>

        <RelatedContentGuides guides={relatedGuides} />
      </article>
    </main>
  );
}
