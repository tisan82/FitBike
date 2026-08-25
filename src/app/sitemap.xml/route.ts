import { SITE_URL } from "@/lib/seo/site";
import {
  findActiveModelYearsForSitemap,
  findPublishedContentsForSitemap,
} from "@/repositories/seo.repository";

const SITEMAP_REVALIDATE_SECONDS = 300;

export const dynamic = "force-dynamic";

type SitemapEntry = {
  url: string;
  lastModified?: string;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function serializeSitemap(entries: SitemapEntry[]) {
  const urls = entries.map(({ url, lastModified }) => [
    "  <url>",
    `    <loc>${escapeXml(url)}</loc>`,
    ...(lastModified ? [`    <lastmod>${escapeXml(lastModified)}</lastmod>`] : []),
    "  </url>",
  ].join("\n"));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n");
}

export async function GET() {
  const staticEntries: SitemapEntry[] = [
    { url: SITE_URL },
    { url: `${SITE_URL}/bike-selector` },
    { url: `${SITE_URL}/tire-models/maxxis` },
    { url: `${SITE_URL}/contents` },
  ];

  let entries = staticEntries;
  try {
    const [years, contents] = await Promise.all([
      findActiveModelYearsForSitemap(),
      findPublishedContentsForSitemap(),
    ]);
    entries = [
      ...staticEntries,
      ...years.map((year) => ({
        url: `${SITE_URL}/model-detail/${year.bike_model_year_id}`,
        lastModified: new Date(year.updated_at).toISOString(),
      })),
      ...contents.map((content) => ({
        url: `${SITE_URL}/contents/${content.content_key}`,
        lastModified: new Date(content.updated_at).toISOString(),
      })),
    ];
  } catch {
    // Keep the stable public routes available when a data source is temporarily unavailable.
  }

  return new Response(serializeSitemap(entries), {
    headers: {
      "Cache-Control": `public, s-maxage=${SITEMAP_REVALIDATE_SECONDS}, stale-while-revalidate=60`,
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
