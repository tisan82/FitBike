import {
  findPublishedContentByKey,
  findPublishedContents,
  findPublishedContentsByIds,
  findContentBikeModelRelationsByBikeModelId,
  findContentBikeModelRelationsByContentId,
  findActiveRelatedBikes,
  findActiveRelatedBikeBrands,
  findLatestActiveRelatedBikeYears,
  type ContentDetailRow,
  type ContentListRow,
} from "@/repositories/content.repository";
import {
  CONTENT_TYPES,
  type ContentBlock,
  type ContentImage,
  type ContentListItem,
  type ContentType,
  type PublishedContent,
  type RelatedBike,
  type RelatedGuide,
} from "@/features/content/types/content.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function parseImage(value: unknown): ContentImage | null {
  if (!isRecord(value) || typeof value.storagePath !== "string" || typeof value.alt !== "string") return null;
  return {
    storagePath: value.storagePath,
    alt: value.alt,
    ...(typeof value.caption === "string" ? { caption: value.caption } : {}),
  };
}

function parseBlock(value: unknown): ContentBlock | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const text = typeof value.text === "string" ? value.text : null;
  const body = typeof value.body === "string" ? value.body : null;
  const title = typeof value.title === "string" ? value.title : undefined;

  switch (value.type) {
    case "heading":
      return text && (value.level === 2 || value.level === 3)
        ? { type: "heading", level: value.level, text }
        : null;
    case "paragraph":
      return text ? { type: "paragraph", text } : null;
    case "image": {
      const image = parseImage(value);
      return image ? { type: "image", ...image } : null;
    }
    case "image_gallery": {
      const images = Array.isArray(value.images) ? value.images.map(parseImage) : [];
      if (images.length < 2 || images.some((image) => image === null)) return null;
      const columns = value.columns === 3 ? 3 : 2;
      return { type: "image_gallery", images: images as ContentImage[], columns };
    }
    case "bullet_list":
    case "numbered_list": {
      const items = strings(value.items);
      return items ? { type: value.type, items } : null;
    }
    case "step":
      return title && body
        ? {
            type: "step",
            title,
            body,
            ...(typeof value.number === "number" ? { number: value.number } : {}),
          }
        : null;
    case "tip":
    case "warning":
      return body ? { type: value.type, body, ...(title ? { title } : {}) } : null;
    case "table": {
      const headers = strings(value.headers);
      const rows = Array.isArray(value.rows) ? value.rows.map(strings) : [];
      return headers && rows.every((row): row is string[] => row !== null)
        ? { type: "table", headers, rows }
        : null;
    }
    default:
      return null;
  }
}

function contentType(value: string): ContentType {
  if ((CONTENT_TYPES as readonly string[]).includes(value)) return value as ContentType;
  throw new Error(`Unsupported content type: ${value}`);
}

function mapListRow(row: ContentListRow): ContentListItem {
  return {
    contentId: row.content_id,
    contentKey: row.content_key,
    title: row.title,
    summary: row.summary,
    contentType: contentType(row.content_type),
    thumbnailImageStoragePath: row.thumbnail_image_storage_path,
    publishedAt: row.published_at,
  };
}

function mapDetailRow(row: ContentDetailRow): PublishedContent {
  const rawBlocks = Array.isArray(row.body_blocks) ? row.body_blocks : [];
  return {
    ...mapListRow(row),
    heroImageStoragePath: row.hero_image_storage_path,
    bodyBlocks: rawBlocks.map(parseBlock).filter((block): block is ContentBlock => block !== null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getPublishedContents(): Promise<ContentListItem[]> {
  return (await findPublishedContents()).map(mapListRow);
}

export async function getPublishedContentByKey(
  contentKey: string,
): Promise<PublishedContent | null> {
  const row = await findPublishedContentByKey(contentKey);
  return row ? mapDetailRow(row) : null;
}

export async function getPublishedGuidesByBikeModelId(bikeModelId: number): Promise<RelatedGuide[]> {
  const relations = await findContentBikeModelRelationsByBikeModelId(bikeModelId);
  return (await findPublishedContentsByIds(relations.map((relation) => relation.content_id), 3)).map(mapListRow).map(({ contentId, contentKey, title, summary, contentType }) => ({ contentId, contentKey, title, summary, contentType }));
}

export async function getRelatedBikesByContentId(contentId: number): Promise<RelatedBike[]> {
  const relations = await findContentBikeModelRelationsByContentId(contentId);
  const bikeModelIds = relations.map((relation) => relation.bike_model_id);
  const bikes = await findActiveRelatedBikes(bikeModelIds);
  const [brands, years] = await Promise.all([
    findActiveRelatedBikeBrands([...new Set(bikes.map((bike) => bike.brand_id))]),
    findLatestActiveRelatedBikeYears(bikeModelIds),
  ]);
  const brandMap = new Map(brands.map((brand) => [brand.brand_id, brand]));
  const latestYearMap = new Map<number, number>();
  for (const year of years) if (!latestYearMap.has(year.bike_model_id)) latestYearMap.set(year.bike_model_id, year.bike_model_year_id);
  return bikes.flatMap((bike) => {
    const brand = brandMap.get(bike.brand_id);
    const bikeModelYearId = latestYearMap.get(bike.bike_model_id);
    return brand && bikeModelYearId ? [{ bikeModelId: bike.bike_model_id, bikeModelYearId, brandNameEn: brand.brand_en, brandNameKo: brand.brand_ko, modelNameEn: bike.model_name_en, modelNameKo: bike.model_name_ko }] : [];
  });
}
