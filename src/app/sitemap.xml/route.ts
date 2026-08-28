import { SITE_URL } from "@/lib/seo/site";
import {
  findActiveBatteryProductsForSitemap,
  findActiveModelYearsForSitemap,
  findActiveTireModelsForSitemap,
  findActiveTireProductsForSitemap,
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

function iso(value: string) {
  return new Date(value).toISOString();
}

export async function GET() {
  const staticEntries: SitemapEntry[] = [
    { url: SITE_URL },
    { url: `${SITE_URL}/bike-selector` },
    { url: `${SITE_URL}/tire-models/maxxis` },
    { url: `${SITE_URL}/contents` },
    { url: `${SITE_URL}/shops` },
  ];

  let entries = staticEntries;
  try {
    const [years, contents, tireProducts, tireModels, batteryProducts] = await Promise.all([
      findActiveModelYearsForSitemap(),
      findPublishedContentsForSitemap(),
      findActiveTireProductsForSitemap(),
      findActiveTireModelsForSitemap(),
      findActiveBatteryProductsForSitemap(),
    ]);
    entries = [
      ...staticEntries,
      ...years.map((year) => ({
        url: `${SITE_URL}/model-detail/${year.bike_model_year_id}`,
        lastModified: iso(year.updated_at),
      })),
      ...tireModels.map((model) => ({
        url: `${SITE_URL}/tire-detail/model/${encodeURIComponent(model.tire_model_key)}`,
        lastModified: iso(model.updated_at),
      })),
      ...tireProducts.map((product) => ({
        url: `${SITE_URL}/tire-detail/${product.tire_product_id}`,
        lastModified: iso(product.updated_at),
      })),
      ...batteryProducts.map((product) => ({
        url: `${SITE_URL}/battery-detail/${product.battery_product_id}`,
        lastModified: iso(product.updated_at),
      })),
      ...contents.map((content) => ({
        url: `${SITE_URL}/contents/${content.content_key}`,
        lastModified: iso(content.updated_at),
      })),
    ];
  } catch {
    // Keep stable public routes available when a data source is temporarily unavailable.
  }

  return new Response(serializeSitemap(entries), {
    headers: {
      "Cache-Control": `public, s-maxage=${SITEMAP_REVALIDATE_SECONDS}, stale-while-revalidate=60`,
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
