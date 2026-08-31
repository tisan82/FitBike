import Image from "next/image";

import { getStoragePublicUrl } from "@/lib/supabase/storage";
import type { ContentBlock, ContentImage } from "@/features/content/types/content.types";

function resolveContentImage(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return path;
  return getStoragePublicUrl(path, "content-assets");
}

function ContentVisual({ image, compact = false, contain = false }: { image: ContentImage; compact?: boolean; contain?: boolean }) {
  const src = resolveContentImage(image.storagePath);
  if (!src) return null;
  return (
    <figure className="space-y-2">
      <Image alt={image.alt} className={`h-auto w-full rounded-2xl ${compact ? "aspect-[4/3]" : ""} ${contain ? "bg-surface-secondary object-contain p-3" : "object-cover"}`} height={900} src={src} unoptimized width={1200} />
      {image.caption?.trim() ? <figcaption className="text-sm leading-6 text-foreground-secondary">{image.caption}</figcaption> : null}
    </figure>
  );
}

export function ContentBlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  const seenImagePaths = new Set<string>();
  return (
    <div className="space-y-7 text-base leading-8 text-foreground sm:text-[17px]">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case "heading": {
            if (!block.text?.trim()) return null;
            return block.level === 2 ? <h2 className="border-t border-border pt-9 text-xl font-bold leading-8 first:border-t-0 first:pt-0 sm:text-2xl" key={key}>{block.text}</h2> : <h3 className="pt-3 text-lg font-bold leading-8 sm:text-xl" key={key}>{block.text}</h3>;
          }
          case "paragraph": return block.text?.trim() ? <p className="whitespace-pre-line text-pretty" key={key}>{block.text}</p> : null;
          case "image": {
            if (!block.storagePath?.trim() || seenImagePaths.has(block.storagePath)) return null;
            seenImagePaths.add(block.storagePath);
            const src = resolveContentImage(block.storagePath);
            return src ? <figure className="space-y-3 py-2" key={key}><Image alt={block.alt} className="h-auto w-full rounded-2xl" height={900} src={src} unoptimized width={1200} />{block.caption?.trim() ? <figcaption className="text-sm leading-6 text-foreground-secondary">{block.caption}</figcaption> : null}</figure> : null;
          }
          case "image_gallery": {
            const uniqueImages = block.images.filter((image) => { if (!image.storagePath?.trim() || seenImagePaths.has(image.storagePath)) return false; seenImagePaths.add(image.storagePath); return true; });
            if (uniqueImages.length === 0) return null;
            if (block.layout === "swipe") return <section aria-label="작업 및 확인 이미지" className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 pt-2 sm:mx-0 sm:px-0" key={key}>{uniqueImages.map((image, imageIndex) => <div className="w-[84%] min-w-[84%] snap-start sm:w-[46%] sm:min-w-[46%] lg:w-[32%] lg:min-w-[32%]" key={`${image.storagePath}-${imageIndex}`}><ContentVisual compact contain image={image} /></div>)}</section>;
            return <section aria-label="관련 이미지" className={`grid grid-cols-1 gap-4 py-2 sm:gap-5 ${block.columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`} key={key}>{uniqueImages.map((image, imageIndex) => <ContentVisual compact image={image} key={`${image.storagePath}-${imageIndex}`} />)}</section>;
          }
          case "bullet_list": return block.items?.length ? <ul className="list-disc space-y-3 pl-6 marker:text-primary" key={key}>{block.items.filter(Boolean).map((item, itemIndex) => <li className="pl-1" key={itemIndex}>{item}</li>)}</ul> : null;
          case "numbered_list": return block.items?.length ? <ol className="list-decimal space-y-3 pl-6 marker:font-bold marker:text-primary" key={key}>{block.items.filter(Boolean).map((item, itemIndex) => <li className="pl-1" key={itemIndex}>{item}</li>)}</ol> : null;
          case "step": return block.body?.trim() ? <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" key={key}><h3 className="text-lg font-bold leading-7">{block.number ? `${block.number}. ` : ""}{block.title}</h3><p className="mt-3 whitespace-pre-line leading-8">{block.body}</p></section> : null;
          case "tip": case "warning": return block.body?.trim() ? <aside className={`rounded-2xl border p-5 sm:p-6 ${block.type === "tip" ? "border-selected-border bg-selected-background" : "border-amber-300 bg-amber-50"}`} key={key}><p className="font-bold">{block.title ?? (block.type === "tip" ? "알아두면 좋은 점" : "주의")}</p><p className="mt-3 whitespace-pre-line leading-8">{block.body}</p></aside> : null;
          case "table": return block.rows?.length ? <div className="max-w-full overflow-x-auto rounded-2xl border border-border" key={key}><table className="w-full min-w-lg border-collapse text-left text-base leading-7"><thead className="bg-surface-secondary"><tr>{block.headers.map((header, cellIndex) => <th className="border-b border-border px-4 py-3 font-bold" key={cellIndex} scope="col">{header}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr className="border-b border-border last:border-b-0" key={rowIndex}>{row.map((cell, cellIndex) => <td className="px-4 py-3 align-top" key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : null;
        }
      })}
    </div>
  );
}
