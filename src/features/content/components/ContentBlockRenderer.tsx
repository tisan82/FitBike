import Image from "next/image";

import { getStoragePublicUrl } from "@/lib/supabase/storage";
import type { ContentBlock } from "@/features/content/types/content.types";

export function ContentBlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="space-y-6 text-base leading-7 text-foreground">
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2 className="pt-4 text-xl font-bold leading-7" key={key}>{block.text}</h2>
            ) : (
              <h3 className="pt-2 text-lg font-bold leading-7" key={key}>{block.text}</h3>
            );
          case "paragraph":
            return <p className="whitespace-pre-line" key={key}>{block.text}</p>;
          case "image": {
            const src = getStoragePublicUrl(block.storagePath, "content-assets");
            return src ? (
              <figure className="space-y-2" key={key}>
                <Image alt={block.alt} className="h-auto w-full rounded-2xl" height={900} src={src} unoptimized width={1200} />
                {block.caption ? <figcaption className="text-sm text-foreground-secondary">{block.caption}</figcaption> : null}
              </figure>
            ) : null;
          }
          case "bullet_list":
            return <ul className="list-disc space-y-2 pl-6" key={key}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
          case "numbered_list":
            return <ol className="list-decimal space-y-2 pl-6" key={key}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ol>;
          case "step":
            return (
              <section className="rounded-2xl border border-border p-5" key={key}>
                <h3 className="text-lg font-bold">{block.number ? `${block.number}. ` : ""}{block.title}</h3>
                <p className="mt-2 whitespace-pre-line">{block.body}</p>
              </section>
            );
          case "tip":
          case "warning":
            return (
              <aside className={`rounded-2xl border p-5 ${block.type === "tip" ? "border-selected-border bg-selected-background" : "border-amber-300 bg-amber-50"}`} key={key}>
                <p className="font-bold">{block.title ?? (block.type === "tip" ? "팁" : "주의")}</p>
                <p className="mt-2 whitespace-pre-line">{block.body}</p>
              </aside>
            );
          case "table":
            return (
              <div className="max-w-full overflow-x-auto rounded-2xl border border-border" key={key}>
                <table className="w-full min-w-lg border-collapse text-left text-base">
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
