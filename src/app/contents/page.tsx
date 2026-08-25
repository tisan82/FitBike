import type { Metadata } from "next";

import { ContentList } from "@/features/content";
import { getPublishedContents } from "@/services/content.service";

const title = "바이크 가이드";
const description = "오토바이 점검·관리부터 부품과 규격 정보까지 확인하세요.";

export const revalidate = 300;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/contents" },
  openGraph: { type: "website", title, description, url: "/contents" },
};

export default async function ContentsPage() {
  const contents = await getPublishedContents();
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-5 sm:py-14">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-bold leading-8">{title}</h1>
        <p className="mt-3 text-base leading-7 text-foreground-secondary">{description}</p>
      </header>
      <ContentList contents={contents} />
    </main>
  );
}
