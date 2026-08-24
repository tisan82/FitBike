"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { getStoragePublicUrl } from "@/lib/supabase/storage";
import type { ContentListItem, ContentType } from "@/features/content/types/content.types";

const filters: { label: string; value: "ALL" | ContentType }[] = [
  { label: "전체", value: "ALL" },
  { label: "점검/관리", value: "MAINTENANCE" },
  { label: "교체/DIY", value: "DIY" },
  { label: "부품 규격", value: "PARTS_GUIDE" },
  { label: "모델 가이드", value: "MODEL_GUIDE" },
];

const labels: Record<ContentType, string> = {
  MAINTENANCE: "점검/관리",
  DIY: "교체/DIY",
  PARTS_GUIDE: "부품 규격",
  MODEL_GUIDE: "모델 가이드",
};

export function ContentList({ contents }: { contents: ContentListItem[] }) {
  const [activeFilter, setActiveFilter] = useState<"ALL" | ContentType>("ALL");
  const visible = activeFilter === "ALL" ? contents : contents.filter((content) => content.contentType === activeFilter);

  return (
    <>
      <div aria-label="콘텐츠 유형 필터" className="mt-8 flex gap-2 overflow-x-auto pb-2">
        {filters.map((filter) => (
          <button aria-pressed={activeFilter === filter.value} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold ${activeFilter === filter.value ? "border-selected-border bg-selected-background text-primary" : "border-border bg-surface text-foreground"}`} key={filter.value} onClick={() => setActiveFilter(filter.value)} type="button">{filter.label}</button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((content) => {
          const thumbnail = getStoragePublicUrl(content.thumbnailImageStoragePath, "content-assets");
          return (
            <Link className="overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={`/contents/${encodeURIComponent(content.contentKey)}`} key={content.contentId}>
              {thumbnail ? <Image alt="" className="aspect-video w-full object-cover" height={450} src={thumbnail} unoptimized width={800} /> : null}
              <div className="p-5">
                <p className="text-sm font-bold text-primary">{labels[content.contentType]}</p>
                <h2 className="mt-2 text-lg font-bold leading-7">{content.title}</h2>
                <p className="mt-2 line-clamp-3 text-base leading-7 text-foreground-secondary">{content.summary}</p>
              </div>
            </Link>
          );
        })}
      </div>
      {visible.length === 0 ? <p className="mt-10 text-base text-foreground-secondary">해당 유형의 콘텐츠가 없습니다.</p> : null}
    </>
  );
}
