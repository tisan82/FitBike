import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import type { ContentListItem } from "@/features/content/types/content.types";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/site";
import { getStoragePublicUrl } from "@/lib/supabase/storage";
import { getPublishedContents } from "@/services/content.service";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "오토바이 모델 정보·관리 가이드·정비소 찾기",
  description: "내 오토바이의 모델·연식별 타이어, 배터리, 브레이크 규격을 확인하고 관리·DIY 가이드와 주변 정비소 정보를 찾아보세요.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "오토바이 모델 정보·관리 가이드·정비소 찾기 | FitBike",
    description: "내 바이크를 알고 관리하는 데 필요한 모델별 규격, 관리 가이드와 정비소 정보를 확인하세요.",
    url: "/",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary",
    title: "오토바이 모델 정보·관리 가이드·정비소 찾기 | FitBike",
    description: "내 바이크를 알고 관리하는 데 필요한 정보를 한곳에서 확인하세요.",
    images: [DEFAULT_OG_IMAGE],
  },
};

const contentLabels: Record<ContentListItem["contentType"], string> = {
  MAINTENANCE: "점검/관리",
  DIY: "교체/DIY",
  PARTS_GUIDE: "부품 이해",
  MODEL_GUIDE: "모델 가이드",
};

const journeys = [
  {
    eyebrow: "내 바이크",
    title: "모델·연식 기준으로 확인",
    description: "브랜드와 모델, 연식을 선택해 타이어·배터리·브레이크 규격을 확인합니다.",
    href: "/bike-selector",
    cta: "내 바이크 찾기",
  },
  {
    eyebrow: "관리 가이드",
    title: "점검·교체 방법 알아보기",
    description: "교체 시기부터 일상 점검과 DIY까지 필요한 내용을 먼저 이해할 수 있습니다.",
    href: "/contents",
    cta: "가이드 보기",
  },
  {
    eyebrow: "정비소",
    title: "주변 오토바이 정비소 찾기",
    description: "지역과 정비 항목을 기준으로 가까운 오토바이 정비소 정보를 확인합니다.",
    href: "/shops",
    cta: "정비소 찾기",
  },
];

export default async function HomePage() {
  const recentGuides = (await getPublishedContents()).slice(0, 3);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="px-5 pb-10 pt-10 sm:pb-14 sm:pt-16">
        <div className="mx-auto max-w-5xl">
          <p className="mb-3 text-sm font-semibold text-primary">내 바이크를 알고, 관리하는 방법</p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            내 바이크에 필요한 정보를 한곳에서 확인하세요.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-foreground-secondary sm:text-lg sm:leading-8">
            모델·연식별 부품 규격부터 점검·DIY 가이드, 주변 오토바이 정비소까지 필요한 순간에 맞춰 찾아볼 수 있습니다.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground transition hover:bg-primary-hover" href="/bike-selector">
              내 바이크 찾기
            </Link>
            <Link className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-surface px-6 py-3 text-base font-bold transition hover:bg-surface-secondary" href="/shops">
              주변 정비소 찾기
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface-secondary px-5 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="mb-6">
            <p className="text-sm font-semibold text-primary">무엇을 찾고 있나요?</p>
            <h2 className="mt-2 text-2xl font-bold">목적에 맞는 곳에서 바로 시작하세요.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {journeys.map((journey) => (
              <Link className="group rounded-2xl border border-border bg-surface p-5 transition hover:border-primary sm:p-6" href={journey.href} key={journey.href}>
                <p className="text-sm font-bold text-primary">{journey.eyebrow}</p>
                <h3 className="mt-2 text-lg font-bold leading-7">{journey.title}</h3>
                <p className="mt-2 text-base leading-7 text-foreground-secondary">{journey.description}</p>
                <p className="mt-5 text-base font-bold text-primary">{journey.cta} →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:py-16" id="guides">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-primary">지금 알아두면 좋은 정보</p>
              <h2 className="mt-2 text-2xl font-bold leading-8">정비하기 전에 먼저 이해하세요.</h2>
              <p className="mt-3 text-base leading-7 text-foreground-secondary">교체 시기, 상태 확인, DIY 방법처럼 바이크를 관리하면서 자주 궁금한 내용을 정리했습니다.</p>
            </div>
            <Link className="inline-flex min-h-11 items-center font-bold text-primary transition hover:text-primary-hover" href="/contents">전체 가이드 보기 →</Link>
          </div>
          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {recentGuides.map((guide) => <GuideCard guide={guide} key={guide.contentId} />)}
          </div>
        </div>
      </section>

      <section className="px-5 pb-12 sm:pb-16">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
          {[{ label: "타이어", text: "앞·뒤 규격과 연결 상품 확인" }, { label: "배터리", text: "기준 규격과 호환 상품 확인" }, { label: "브레이크", text: "차량 기준 브레이크 정보 확인" }].map((item) => (
            <div className="rounded-2xl border border-border bg-surface p-5" key={item.label}>
              <p className="text-lg font-bold">{item.label}</p>
              <p className="mt-2 text-base leading-7 text-foreground-secondary">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl rounded-3xl border border-border bg-surface p-6 sm:p-9">
          <p className="text-sm font-semibold text-primary">FitBike 사용 원칙</p>
          <h2 className="mt-2 text-2xl font-bold">일반 정보와 내 바이크의 실제 규격은 구분해서 확인하세요.</h2>
          <p className="mt-3 max-w-3xl text-base leading-7 text-foreground-secondary">
            관리 가이드는 이해를 돕는 정보이며, 실제 부품 규격은 모델과 연식에 따라 달라질 수 있습니다. 필요한 경우에만 상품과 정비소 정보를 연결합니다.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground transition hover:bg-primary-hover" href="/bike-selector">내 바이크 선택하기</Link>
            <Link className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border px-6 py-3 font-bold transition hover:bg-surface-secondary" href="/contents">관리 가이드 둘러보기</Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function GuideCard({ guide }: { guide: ContentListItem }) {
  const thumbnail = getStoragePublicUrl(guide.thumbnailImageStoragePath, "content-assets");
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary">
      <Link className="block h-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={`/contents/${encodeURIComponent(guide.contentKey)}`}>
        {thumbnail ? <Image alt={`${guide.title} 가이드`} className="aspect-video w-full object-cover" height={450} src={thumbnail} unoptimized width={800} /> : null}
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
