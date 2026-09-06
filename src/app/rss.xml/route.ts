import type { ContentBlock } from "@/features/content/types/content.types";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";
import { getLatestPublishedContentsForFeed } from "@/services/content.service";

export const dynamic = "force-dynamic";

const FEED_REVALIDATE_SECONDS = 300;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function blockText(block: ContentBlock): string[] {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return [block.text];
    case "bullet_list":
    case "numbered_list":
      return block.items;
    case "step":
      return [block.title, block.body];
    case "tip":
    case "warning":
      return [block.title ?? (block.type === "tip" ? "알아두면 좋은 점" : "주의"), block.body];
    case "table":
      return [block.headers.join(" · "), ...block.rows.map((row) => row.join(" · "))];
    case "image":
      return [block.alt, block.caption ?? ""];
    case "image_gallery":
      return block.images.flatMap((image) => [image.alt, image.caption ?? ""]);
  }
}

function contentText(summary: string, blocks: ContentBlock[]) {
  return [summary, ...blocks.flatMap(blockText)].map((value) => value.trim()).filter(Boolean).join("\n\n");
}

export async function GET() {
  const contents = await getLatestPublishedContentsForFeed();
  const items = contents.map((content) => {
    const url = `${SITE_URL}/contents/${encodeURIComponent(content.contentKey)}`;
    return [
      "    <item>",
      `      <title>${escapeXml(content.title)}</title>`,
      `      <link>${escapeXml(url)}</link>`,
      `      <description>${escapeXml(contentText(content.summary, content.bodyBlocks))}</description>`,
      `      <pubDate>${new Date(content.publishedAt).toUTCString()}</pubDate>`,
      `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
      "    </item>",
    ].join("\n");
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${escapeXml(`${SITE_NAME} 바이크 가이드`)}</title>`,
    `    <link>${escapeXml(`${SITE_URL}/contents`)}</link>`,
    "    <description>오토바이 점검·관리, 교체·DIY, 부품 규격과 모델 정보</description>",
    "    <language>ko-KR</language>",
    ...items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Cache-Control": `public, s-maxage=${FEED_REVALIDATE_SECONDS}, stale-while-revalidate=60`,
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
