import Image from "next/image";

import { getStoragePublicUrl } from "@/lib/supabase/storage";
import type { ContentBlock } from "@/features/content/types/content.types";

export function ContentBlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-7 text-base leading-8 text-foreground sm:text-[17px]">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2 className="border-t border-border pt-9 text-xl font-bold leading-8 first:border-t-0 first:pt-0 sm:text-2xl" key={key}>
                {block.text}
              </h2>
            ) : (
              <h3 className="pt-3 text-lg font-bold leading-8 sm:text-xl" key={key}>{block.text}</h3>
            );
          case "paragraph":
            return <p className="whitespace-pre-line text-pretty" key={key}>{block.text}</p>;
          case "image": {
            const src = getStoragePublicUrl(block.storagePath, "content-assets");
            return src ? (
              <figure className="space-y-3 py-2" key={key}>
                <Image alt={block.alt} className="h-auto w-full rounded-2xl" height={900} src={src} unoptimized width={1200} />
                {block.caption ? <figcaption className="text-sm leading-6 text-foreground-secondary">{block.caption}</figcaption> : null}
              </figure>
            ) : null;
          }
          case "bullet_list":
            return <ul className="list-disc space-y-3 pl-6 marker:text-primary" key={key}>{block.items.map((item, itemIndex) => <li className="pl-1" key={itemIndex}>{item}</li>)}</ul>;
          case "numbered_list":
            return <ol className="list-decimal space-y-3 pl-6 marker:font-bold marker:text-primary" key={key}>{block.items.map((item, itemIndex) => <li className="pl-1" key={itemIndex}>{item}</li>)}</ol>;
          case "step":
            return (
              <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6" key={key}>
                <h3 className="text-lg font-bold leading-7">{block.number ? `${block.number}. ` : ""}{block.title}</h3>
                <p className="mt-3 whitespace-pre-line leading-8">{block.body}</p>
              </section>
            );
          case "tip":
          case "warning":
            return (
              <aside className={`rounded-2xl border p-5 sm:p-6 ${block.type === "tip" ? "border-selected-border bg-selected-background" : "border-amber-300 bg-amber-50"}`} key={key}>
                <p className="font-bold">{block.title ?? (block.type === "tip" ? "알아두면 좋은 점" : "주의")}</p>
                <p className="mt-3 whitespace-pre-line leading-8">{block.body}</p>
              </aside>
            );
          case "table":
            return (
              <div className="max-w-full overflow-x-auto rounded-2xl border border-border" key={key}>
                <table className="w-full min-w-lg border-collapse text-left text-base leading-7">
                  <thead className="bg-surface-secondary"><tr>{block.headers.map((header, cellIndex) => <th className="border-b border-border px-4 py-3 font-bold" key={cellIndex} scope="col">{header}</th>)}</tr></thead>
                  <tbody>{block.rows.map((row, rowIndex) => <tr className="border-b border-border last:border-b-0" key={rowIndex}>{row.map((cell, cellIndex) => <td className="px-4 py-3 align-top" key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
