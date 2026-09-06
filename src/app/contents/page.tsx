import type { Metadata } from "next";

import { ContentList } from "@/features/content";
import { getPublishedContents } from "@/services/content.service";

const title = "오토바이 정비·점검·DIY 가이드";
const description = "오토바이 타이어·배터리·브레이크 점검, 교체 시기, DIY 방법과 모델별 부품 규격 정보를 찾아보세요.";

export const revalidate = 300;

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: "/contents",
    types: { "application/rss+xml": [{ title: "FitBike 바이크 가이드", url: "/rss.xml" }] },
  },
  openGraph: { type: "website", title, description, url: "/contents" },
};

export default async function ContentsPage() {
  const contents = await getPublishedContents();
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-5 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">핏바이크 오토바이 정보</p>
        <h1 className="mt-2 text-2xl font-bold leading-8 sm:text-3xl sm:leading-10">오토바이 정비·점검·DIY 가이드</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-foreground-secondary">점검과 관리 방법부터 부품 규격, 모델별 정보까지 검색하거나 유형을 선택해 확인할 수 있습니다.</p>
        <p className="mt-4 text-sm leading-6 text-foreground-secondary">차량에 맞는 실제 규격은 가이드 정보와 다를 수 있습니다. 정확한 확인이 필요하면 내 바이크를 먼저 선택하세요.</p>
      </header>
      <ContentList contents={contents} />
    </main>
  );
}
