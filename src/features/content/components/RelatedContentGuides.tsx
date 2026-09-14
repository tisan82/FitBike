import Image from "next/image";
import Link from "next/link";

import type { ContentListItem } from "@/features/content/types/content.types";
import { getStoragePublicUrl } from "@/lib/supabase/storage";

const labels = {
  MAINTENANCE: "점검/관리",
  DIY: "교체/DIY",
  PARTS_GUIDE: "부품 이해",
  MODEL_GUIDE: "모델 정보",
} as const;

export function RelatedContentGuides({ guides }: { guides: ContentListItem[] }) {
  if (guides.length === 0) return null;

  return (
    <section aria-labelledby="related-content-title" className="mt-14 border-t border-border pt-10 sm:mt-16 sm:pt-12">
      <div className="flex items-end justify-between gap-5">
        <div>
          <p className="text-sm font-bold text-primary">다음으로 살펴보기</p>
          <h2 className="mt-1 text-xl font-bold sm:text-2xl" id="related-content-title">이어서 볼 가이드</h2>
          <p className="mt-2 text-sm leading-6 text-foreground-secondary">지금 읽은 내용과 연결되는 점검·관리 정보를 계속 확인해 보세요.</p>
        </div>
        <Link className="hidden shrink-0 font-bold text-primary hover:text-primary-hover sm:inline-flex" href="/contents">전체 보기 →</Link>
      </div>

      <div className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 scroll-px-4 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-3">
        {guides.map((guide) => {
          const thumbnail = getStoragePublicUrl(guide.thumbnailImageStoragePath, "content-assets");
          return (
            <article className="w-[84%] min-w-[84%] snap-start overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-primary sm:w-auto sm:min-w-0" key={guide.contentId}>
              <Link className="block h-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={`/contents/${encodeURIComponent(guide.contentKey)}`}>
                {thumbnail ? (
                  <Image
                    alt={`${guide.title} 가이드`}
                    className="aspect-video w-full object-cover"
                    height={450}
                    loading="lazy"
                    sizes="(max-width: 640px) 84vw, (max-width: 1024px) 50vw, 33vw"
                    src={thumbnail}
                    unoptimized
                    width={800}
                  />
                ) : null}
                <div className="p-5">
                  <p className="text-sm font-bold text-primary">{labels[guide.contentType]}</p>
                  <h3 className="mt-2 text-lg font-bold leading-7">{guide.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-foreground-secondary">{guide.summary}</p>
                  <p className="mt-4 font-bold text-primary">가이드 보기 →</p>
                </div>
              </Link>
            </article>
          );
        })}
      </div>

      <Link className="mt-5 inline-flex min-h-11 items-center font-bold text-primary hover:text-primary-hover sm:hidden" href="/contents">전체 가이드 보기 →</Link>
    </section>
  );
}
