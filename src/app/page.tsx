import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import type { ContentListItem } from "@/features/content/types/content.types";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/site";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { getPublishedContents } from "@/services/content.service";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "오토바이 타이어·배터리·브레이크 규격 찾기",
  description: "내 오토바이의 브랜드, 모델, 연식을 선택해 타이어, 배터리, 브레이크 규격과 연결 상품을 확인하세요.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "오토바이 타이어·배터리·브레이크 규격 찾기 | FitBike",
    description: "브랜드, 모델, 연식 기준으로 내 바이크의 부품 규격을 확인하세요.",
    url: "/",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary",
    title: "오토바이 타이어·배터리·브레이크 규격 찾기 | FitBike",
    description: "브랜드, 모델, 연식 기준으로 내 바이크의 부품 규격을 확인하세요.",
    images: [DEFAULT_OG_IMAGE],
  },
};

const contentLabels: Record<ContentListItem["contentType"], string> = {
  MAINTENANCE: "점검/관리",
  DIY: "교체/DIY",
  PARTS_GUIDE: "부품 규격",
  MODEL_GUIDE: "모델 가이드",
};

export default async function HomePage() {
  const recentGuides = (await getPublishedContents()).slice(0, 3);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="px-5 pb-12 pt-12 sm:pb-16 sm:pt-16">
        <div className="mx-auto max-w-5xl">
          <p className="mb-4 text-sm font-semibold text-primary">내 바이크 기준으로 확인</p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            내 바이크에 맞는 부품 규격부터 확인하세요.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-foreground-secondary sm:text-lg sm:leading-8">
            브랜드, 모델, 연식을 선택하면 타이어·배터리·브레이크 정보를 차량 기준으로 확인할 수 있습니다.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              href="/bike-selector"
            >
              내 바이크 찾기
            </Link>
            <a
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-6 py-4 text-base font-semibold text-foreground transition hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              href="#guides"
            >
              관리 가이드 둘러보기
            </a>
          </div>

          <div className="mt-8 flex flex-wrap gap-2" aria-label="FitBike 주요 부품 정보">
            {[
              "타이어 규격",
              "배터리 규격",
              "브레이크 정보",
            ].map((label) => (
              <span className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground-secondary" key={label}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface-secondary px-5 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <p className="text-sm font-bold text-primary">1</p>
              <h2 className="mt-2 text-lg font-bold">브랜드 선택</h2>
              <p className="mt-2 text-base leading-7 text-foreground-secondary">내 바이크의 제조사를 먼저 선택합니다.</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <p className="text-sm font-bold text-primary">2</p>
              <h2 className="mt-2 text-lg font-bold">모델·연식 확인</h2>
              <p className="mt-2 text-base leading-7 text-foreground-secondary">모델과 연식을 기준으로 같은 차종의 세대를 구분합니다.</p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
              <p className="text-sm font-bold text-primary">3</p>
              <h2 className="mt-2 text-lg font-bold">부품 정보 확인</h2>
              <p className="mt-2 text-base leading-7 text-foreground-secondary">확인된 차량 기준으로 타이어·배터리·브레이크 정보를 봅니다.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:py-16" id="guides">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-primary">바이크 가이드</p>
              <h2 className="mt-2 text-2xl font-bold leading-8">부품을 고르기 전, 필요한 정보를 먼저 확인하세요.</h2>
              <p className="mt-3 text-base leading-7 text-foreground-secondary">
                점검·관리 방법, 부품 규격 이해, 모델별 정보를 FitBike의 공개 가이드에서 확인할 수 있습니다.
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center font-bold text-primary transition hover:text-primary-hover"
              href="/contents"
            >
              전체 가이드 보기 →
            </Link>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {recentGuides.map((guide) => (
              <GuideCard guide={guide} key={guide.contentId} />
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl rounded-3xl border border-border bg-surface p-7 sm:p-9">
          <h2 className="text-2xl font-bold">정보를 읽었다면 내 바이크 기준으로 다시 확인하세요.</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-foreground-secondary">
            일반적인 관리 정보와 실제 차량의 규격은 다를 수 있습니다. FitBike는 모델과 연식을 기준으로 확인된 정보를 연결합니다.
          </p>
          <Link
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:bg-primary-hover"
            href="/bike-selector"
          >
            내 바이크 선택하기
          </Link>
        </div>
      </section>
    </main>
  );
}

function GuideCard({ guide }: { guide: ContentListItem }) {
  const thumbnail = getStoragePublicUrl(guide.thumbnailImageStoragePath, "content-assets");

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary">
      <Link
        className="block h-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        href={`/contents/${encodeURIComponent(guide.contentKey)}`}
      >
        {thumbnail ? (
          <Image
            alt={`${guide.title} 가이드`}
            className="aspect-video w-full object-cover"
            height={450}
            src={thumbnail}
            unoptimized
            width={800}
          />
        ) : null}
        <div className="p-5 sm:p-6">
          <p className="text-sm font-semibold text-primary">{contentLabels[guide.contentType]}</p>
          <h3 className="mt-2 text-lg font-bold leading-7">{guide.title}</h3>
          <p className="mt-3 line-clamp-3 text-base leading-7 text-foreground-secondary">{guide.summary}</p>
          <p className="mt-5 text-base font-semibold text-primary">가이드 보기 →</p>
        </div>
      </Link>
    </article>
  );
}
