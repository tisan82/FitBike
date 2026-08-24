export const CONTENT_TYPES = [
  "MAINTENANCE",
  "DIY",
  "PARTS_GUIDE",
  "MODEL_GUIDE",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export type ContentBlock =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "image"; storagePath: string; alt: string; caption?: string }
  | { type: "bullet_list"; items: string[] }
  | { type: "numbered_list"; items: string[] }
  | { type: "step"; title: string; body: string; number?: number }
  | { type: "tip"; title?: string; body: string }
  | { type: "warning"; title?: string; body: string }
  | { type: "table"; headers: string[]; rows: string[][] };

export type ContentListItem = {
  contentId: number;
  contentKey: string;
  title: string;
  summary: string;
  contentType: ContentType;
  thumbnailImageStoragePath: string | null;
  publishedAt: string;
};

export type PublishedContent = ContentListItem & {
  heroImageStoragePath: string | null;
  bodyBlocks: ContentBlock[];
  createdAt: string;
  updatedAt: string;
};

export type RelatedBike = {
  bikeModelId: number;
  bikeModelYearId: number;
  brandNameEn: string;
  brandNameKo: string | null;
  modelNameEn: string;
  modelNameKo: string | null;
};

export type RelatedGuide = Pick<
  ContentListItem,
  "contentId" | "contentKey" | "title" | "summary" | "contentType"
>;
