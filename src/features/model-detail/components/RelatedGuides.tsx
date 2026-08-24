import Link from "next/link";
import type { RelatedGuide } from "@/features/model-detail/types/model-detail.types";

const labels = { MAINTENANCE: "점검/관리", DIY: "교체/DIY", PARTS_GUIDE: "부품 규격", MODEL_GUIDE: "모델 가이드" } as const;

export function RelatedGuides({ guides }: { guides: RelatedGuide[] }) {
  if (guides.length === 0) return null;
  return <section aria-labelledby="related-guides-title" className="space-y-4"><h2 className="text-xl font-bold" id="related-guides-title">관련 가이드</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{guides.map((guide) => <Link className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" href={`/contents/${encodeURIComponent(guide.contentKey)}`} key={guide.contentId}><p className="text-sm font-bold text-primary">{labels[guide.contentType]}</p><h3 className="mt-2 text-lg font-bold leading-7">{guide.title}</h3><p className="mt-2 line-clamp-3 text-base leading-7 text-foreground-secondary">{guide.summary}</p></Link>)}</div></section>;
}
