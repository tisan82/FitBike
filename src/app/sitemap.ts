import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { findActiveModelYearsForSitemap, findPublishedContentsForSitemap } from "@/repositories/seo.repository";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL },
    { url: `${SITE_URL}/bike-selector` },
    { url: `${SITE_URL}/tire-models/maxxis` },
    { url: `${SITE_URL}/contents` },
  ];
  try {
    const [years, contents] = await Promise.all([
      findActiveModelYearsForSitemap(),
      findPublishedContentsForSitemap(),
    ]);
    return [
      ...staticPages,
      ...years.map((year) => ({ url: `${SITE_URL}/model-detail/${year.bike_model_year_id}`, lastModified: new Date(year.updated_at) })),
      ...contents.map((content) => ({ url: `${SITE_URL}/contents/${content.content_key}`, lastModified: new Date(content.updated_at) })),
    ];
  } catch { return staticPages; }
}
