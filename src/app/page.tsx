import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_OG_IMAGE } from "@/lib/seo/site";
import { getPublishedContents } from "@/services/content.service";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "오토바이 타이어·배터리·브레이크 규격 찾기",
  description: "내 오토바이의 브랜드, 모델, 연식을 선택해 타이어, 배터리, 브레이크 규격과 연결 상품을 확인하세요.",
  alternates: { canonical: "/" },
  openGraph: { title: "오토바이 타이어·배터리·브레이크 규격 찾기 | FitBike", description: "브랜드, 모델, 연식 기준으로 내 바이크의 부품 규격을 확인하세요.", url: "/", images: [DEFAULT_OG_IMAGE] },
  twitter: { card: "summary", title: "오토바이 타이어·배터리·브레이크 규격 찾기 | FitBike", description: "브랜드, 모델, 연식 기준으로 내 바이크의 부품 규격을 확인하세요.", images: [DEFAULT_OG_IMAGE] },
};

export default async function HomePage() {
  const recentGuides = (await getPublishedContents()).slice(0, 3);

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="px-5 pt-16 pb-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-4 text-sm font-semibold text-primary">
            FitBike Today
          </p>

          <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            내 바이크 관리,
            <br />
            정비소 가기 전에 먼저 확인하세요.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-foreground-secondary">
            배터리 방전, 타이어 마모, 오일 교체처럼 막연하게 불안한
            바이크 관리 문제를 먼저 체크하고 판단할 수 있도록 도와드립니다.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#checklist"
              className="rounded-xl bg-primary px-6 py-4 text-center font-semibold text-primary-foreground transition hover:bg-primary-hover"
            >
              먼저 확인할 것 보기
            </a>

            <a
              href="/bike-selector"
              className="rounded-xl border border-border bg-surface px-6 py-4 text-center font-semibold text-foreground transition hover:bg-surface-secondary"
            >
              내 바이크 부품 확인하기
            </a>
          </div>
        </div>
      </section>

      {/* Core Value */}
      <section className="border-y border-border bg-surface-secondary px-5 py-10">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-bold">정비소 가기 전 확인</h2>
            <p className="mt-3 text-base leading-7 text-foreground-secondary">
              증상만 보고 바로 교체하지 말고, 먼저 확인해야 할 기준을
              정리합니다.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-bold">교체 필요 여부 판단</h2>
            <p className="mt-3 text-base leading-7 text-foreground-secondary">
              배터리, 타이어, 오일 상태를 체크리스트 기반으로 판단합니다.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-bold">내 바이크 기준 연결</h2>
            <p className="mt-3 text-base leading-7 text-foreground-secondary">
              일반 정보에서 끝나지 않고, 내 바이크에 맞는 규격 확인으로
              연결합니다.
            </p>
          </div>
        </div>
      </section>

      {/* Checklist */}
      <section id="checklist" className="px-5 py-14">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold">먼저 확인해야 할 관리 항목</h2>
          <p className="mt-4 text-foreground-secondary">
            FitBike Today는 교체 방법보다 “교체가 필요한지” 판단하는
            기준을 제공합니다.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {recentGuides.map((guide) => (
              <ArticleCard
                contentKey={guide.contentKey}
                description={guide.summary}
                key={guide.contentId}
                tag={guide.contentType}
                title={guide.title}
              />
            ))}
          </div>
          <Link className="mt-8 inline-flex min-h-11 items-center font-bold text-primary transition hover:text-primary-hover" href="/contents">
            전체 가이드 보기 →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl rounded-3xl bg-primary p-8 text-primary-foreground sm:p-10">
          <h2 className="text-2xl font-bold">
            내 바이크에 맞는 부품 규격을 확인하세요
          </h2>

          <p className="mt-4 max-w-2xl leading-7 text-blue-50">
            FitBike는 차량 기준으로 배터리, 타이어, 오일 규격을 확인하고
            구매 가능한 상품까지 연결하는 서비스입니다.
          </p>

          <a
            href="/bike-selector"
            className="mt-8 inline-block rounded-xl bg-surface px-6 py-4 font-bold text-primary transition hover:bg-blue-50"
          >
            내 바이크 선택하기
          </a>
        </div>
      </section>
    </main>
  );
}

function ArticleCard({
  contentKey,
  title,
  description,
  tag,
}: {
  contentKey: string;
  title: string;
  description: string;
  tag: string;
}) {
  const labels: Record<string, string> = {
    MAINTENANCE: "점검/관리",
    DIY: "교체/DIY",
    PARTS_GUIDE: "부품 규격",
    MODEL_GUIDE: "모델 가이드",
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary">
      <Link className="block min-h-11 p-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={`/contents/${encodeURIComponent(contentKey)}`}>
        <p className="mb-4 text-sm font-semibold text-primary">{labels[tag] ?? tag}</p>
        <h3 className="text-xl font-bold leading-snug">{title}</h3>
        <p className="mt-4 text-base leading-7 text-foreground-secondary">{description}</p>
        <p className="mt-6 text-base font-semibold text-primary">가이드 보기 →</p>
      </Link>
    </article>
  );
}
