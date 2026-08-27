"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { getStoragePublicUrl } from "@/lib/supabase/storage";
import type { ContentListItem, ContentType } from "@/features/content/types/content.types";

const filters: { label: string; description: string; value: "ALL" | ContentType }[] = [
  { label: "전체", description: "모든 바이크 가이드", value: "ALL" },
  { label: "점검/관리", description: "상태 확인과 관리 기준", value: "MAINTENANCE" },
  { label: "교체/DIY", description: "교체 전 확인과 작업 절차", value: "DIY" },
  { label: "부품 규격", description: "타이어·배터리·브레이크 이해", value: "PARTS_GUIDE" },
  { label: "모델 가이드", description: "모델·연식 기준 규격 정보", value: "MODEL_GUIDE" },
];

const labels: Record<ContentType, string> = {
  MAINTENANCE: "점검/관리",
  DIY: "교체/DIY",
  PARTS_GUIDE: "부품 규격",
  MODEL_GUIDE: "모델 가이드",
};

function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function ContentList({ contents }: { contents: ContentListItem[] }) {
  const [activeFilter, setActiveFilter] = useState<"ALL" | ContentType>("ALL");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const byType: Record<ContentType, number> = {
      MAINTENANCE: 0,
      DIY: 0,
      PARTS_GUIDE: 0,
      MODEL_GUIDE: 0,
    };
    for (const content of contents) byType[content.contentType] += 1;
    return byType;
  }, [contents]);

  const visible = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query);
    return contents.filter((content) => {
      if (activeFilter !== "ALL" && content.contentType !== activeFilter) return false;
      if (!normalizedQuery) return true;
      return `${content.title} ${content.summary}`.toLocaleLowerCase("ko-KR").includes(normalizedQuery);
    });
  }, [activeFilter, contents, query]);

  const hasActiveSearch = query.trim().length > 0;
  const hasActiveFilter = activeFilter !== "ALL";

  function resetDiscovery() {
    setActiveFilter("ALL");
    setQuery("");
  }

  return (
    <section aria-labelledby="content-results-title" className="mt-8">
      <div className="rounded-2xl border border-border bg-surface-secondary p-4 sm:p-5">
        <label className="block text-base font-bold" htmlFor="content-search">
          찾고 싶은 정보를 검색하세요
        </label>
        <p className="mt-1 text-sm leading-6 text-foreground-secondary">
          모델명, 부품명, 점검 항목처럼 알고 있는 단어로 제목과 요약을 검색합니다.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            autoComplete="off"
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base text-foreground outline-none transition placeholder:text-foreground-secondary focus:border-primary focus:ring-2 focus:ring-selected-background"
            id="content-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 배터리, 타이어, C 400"
            type="search"
            value={query}
          />
          {(hasActiveSearch || hasActiveFilter) ? (
            <button
              className="min-h-12 shrink-0 rounded-xl border border-border bg-surface px-5 text-base font-semibold text-foreground transition hover:bg-background"
              onClick={resetDiscovery}
              type="button"
            >
              검색 초기화
            </button>
          ) : null}
        </div>
      </div>

      <div aria-label="콘텐츠 유형 선택" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {filters.map((filter) => {
          const count = filter.value === "ALL" ? contents.length : counts[filter.value];
          const selected = activeFilter === filter.value;
          return (
            <button
              aria-pressed={selected}
              className={`min-h-24 rounded-2xl border p-4 text-left transition ${selected ? "border-selected-border bg-selected-background" : "border-border bg-surface hover:border-primary"}`}
              key={filter.value}
              onClick={() => setActiveFilter(filter.value)}
              type="button"
            >
              <span className={`block text-base font-bold ${selected ? "text-primary" : "text-foreground"}`}>{filter.label}</span>
              <span className="mt-1 block text-sm leading-5 text-foreground-secondary">{filter.description}</span>
              <span className="mt-2 block text-sm font-semibold text-foreground-secondary">{count}개</span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold" id="content-results-title">
            {hasActiveSearch || hasActiveFilter ? "찾은 가이드" : "전체 가이드"}
          </h2>
          <p aria-live="polite" className="mt-1 text-sm text-foreground-secondary">
            {visible.length}개의 콘텐츠를 표시합니다.
          </p>
        </div>
        {hasActiveSearch ? (
          <p className="text-sm font-medium text-foreground-secondary">검색어: “{query.trim()}”</p>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((content) => {
          const thumbnail = getStoragePublicUrl(content.thumbnailImageStoragePath, "content-assets");
          return (
            <Link
              className="overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              href={`/contents/${encodeURIComponent(content.contentKey)}`}
              key={content.contentId}
            >
              {thumbnail ? (
                <Image
                  alt={`${content.title} 가이드`}
                  className="aspect-video w-full object-cover"
                  height={450}
                  src={thumbnail}
                  unoptimized
                  width={800}
                />
              ) : null}
              <div className="p-5">
                <p className="text-sm font-bold text-primary">{labels[content.contentType]}</p>
                <h3 className="mt-2 text-lg font-bold leading-7">{content.title}</h3>
                <p className="mt-2 line-clamp-3 text-base leading-7 text-foreground-secondary">{content.summary}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-lg font-bold">조건에 맞는 가이드가 없습니다.</p>
          <p className="mt-2 text-base leading-7 text-foreground-secondary">검색어를 줄이거나 다른 유형을 선택해 보세요.</p>
          <button className="mt-5 min-h-11 font-bold text-primary" onClick={resetDiscovery} type="button">
            전체 가이드 다시 보기 →
          </button>
        </div>
      ) : null}
    </section>
  );
}
