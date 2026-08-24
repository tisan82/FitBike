import {
  findPublishedContentByKey,
  findPublishedContents,
  type ContentDetailRow,
  type ContentListRow,
} from "@/repositories/content.repository";
import {
  CONTENT_TYPES,
  type ContentBlock,
  type ContentListItem,
  type ContentType,
  type PublishedContent,
} from "@/features/content/types/content.types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
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
    case "image":
      return typeof value.storagePath === "string" && typeof value.alt === "string"
        ? {
            type: "image",
            storagePath: value.storagePath,
            alt: value.alt,
            ...(typeof value.caption === "string" ? { caption: value.caption } : {}),
          }
        : null;
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
