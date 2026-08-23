import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";
import { findActiveModelYearsForSitemap } from "@/repositories/seo.repository";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: SITE_URL },
    { url: `${SITE_URL}/bike-selector` },
    { url: `${SITE_URL}/tire-models/maxxis` },
  ];
  try {
    const years = await findActiveModelYearsForSitemap();
    return [...staticPages, ...years.map((year) => ({ url: `${SITE_URL}/model-detail/${year.bike_model_year_id}`, lastModified: new Date(year.updated_at) }))];
  } catch { return staticPages; }
}
