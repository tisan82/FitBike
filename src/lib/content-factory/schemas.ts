import { z } from "zod";

const keySchema = z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const storagePathSchema = z.string().trim().regex(/^contents\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:thumbnail|hero|body-\d{2})\.webp$/);

const contentImageSchema = z.object({
  storagePath: storagePathSchema,
  alt: z.string().trim().min(1).max(300),
  caption: z.string().trim().min(1).max(500).optional(),
});

export const contentBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: z.string().trim().min(1).max(300) }),
  z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(10_000) }),
  contentImageSchema.extend({ type: z.literal("image") }),
  z.object({ type: z.literal("image_gallery"), images: z.array(contentImageSchema).min(2).max(6), columns: z.union([z.literal(2), z.literal(3)]).optional(), layout: z.enum(["grid", "swipe"]).optional() }),
  z.object({ type: z.literal("bullet_list"), items: z.array(z.string().trim().min(1).max(2_000)).min(1).max(50) }),
  z.object({ type: z.literal("numbered_list"), items: z.array(z.string().trim().min(1).max(2_000)).min(1).max(50) }),
  z.object({ type: z.literal("step"), title: z.string().trim().min(1).max(300), body: z.string().trim().min(1).max(5_000), number: z.number().int().positive().optional() }),
  z.object({ type: z.literal("tip"), title: z.string().trim().min(1).max(300).optional(), body: z.string().trim().min(1).max(5_000) }),
  z.object({ type: z.literal("warning"), title: z.string().trim().min(1).max(300).optional(), body: z.string().trim().min(1).max(5_000) }),
  z.object({ type: z.literal("table"), headers: z.array(z.string().trim().min(1).max(300)).min(1).max(10), rows: z.array(z.array(z.string().trim().max(2_000)).min(1).max(10)).min(1).max(100) }),
]);

export const queueUpdateSchema = z.object({
  expectedStatus: z.enum(["PLANNED", "GENERATING", "REVIEW_REQUIRED", "APPROVED", "BLOCKED"]),
  status: z.enum(["GENERATING", "REVIEW_REQUIRED", "APPROVED", "BLOCKED", "DUPLICATE", "ARCHIVED"]),
  lastError: z.string().trim().max(1_000).nullable().optional(),
}).superRefine((value, context) => {
  const allowed: Record<string, string[]> = {
    PLANNED: ["GENERATING", "BLOCKED", "DUPLICATE", "ARCHIVED"],
    GENERATING: ["REVIEW_REQUIRED", "APPROVED", "BLOCKED"],
    REVIEW_REQUIRED: ["APPROVED", "BLOCKED", "ARCHIVED"],
    APPROVED: ["BLOCKED", "ARCHIVED"],
    BLOCKED: ["GENERATING", "ARCHIVED"],
  };
  if (!allowed[value.expectedStatus]?.includes(value.status)) {
    context.addIssue({ code: "custom", message: "허용되지 않은 큐 상태 전환입니다." });
  }
});

const assetSourceSchema = z.object({
  assetRole: z.enum(["THUMBNAIL", "HERO", "BODY", "REFERENCE"]),
  assetKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  storagePath: storagePathSchema.nullable(),
  sourceType: z.enum(["DIRECT_PHOTO", "BRAND_APPROVED", "OFFICIAL", "BLOG", "WIKIMEDIA", "LICENSED_WEB", "GENERATED", "OTHER"]),
  sourcePageUrl: z.string().url().max(2_000).nullable().optional(),
  sourceAssetUrl: z.string().url().max(2_000).nullable().optional(),
  sourceOwner: z.string().trim().max(500).nullable().optional(),
  licenseName: z.string().trim().max(300).nullable().optional(),
  licenseUrl: z.string().url().max(2_000).nullable().optional(),
  permissionContact: z.string().trim().max(500).nullable().optional(),
  permissionNote: z.string().trim().max(2_000).nullable().optional(),
  rightsStatus: z.enum(["OWNED_APPROVED", "LICENSED_APPROVED", "PERMISSION_CONFIRMED", "NOT_REQUIRED"]),
  edited: z.boolean().default(false),
  editDescription: z.string().trim().max(2_000).nullable().optional(),
  usedInService: z.boolean().default(true),
  lastCheckedAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const publishRequestSchema = z.object({
  topicKey: keySchema,
  content: z.object({
    contentKey: keySchema,
    title: z.string().trim().min(1).max(300),
    summary: z.string().trim().min(1).max(1_000),
    contentType: z.enum(["MAINTENANCE", "DIY", "PARTS_GUIDE", "MODEL_GUIDE"]),
    thumbnailImageStoragePath: storagePathSchema.nullable().default(null),
    heroImageStoragePath: storagePathSchema.nullable().default(null),
    bodyBlocks: z.array(contentBlockSchema).min(1).max(200),
    publishedAt: z.string().datetime({ offset: true }),
  }),
  relations: z.object({
    bikeModelIds: z.array(z.number().int().positive()).max(50).default([]),
    bikeModelYearIds: z.array(z.number().int().positive()).max(100).default([]),
    parts: z.array(z.object({ partType: z.enum(["TIRE", "BATTERY", "BRAKE"]), scopeType: z.literal("CATEGORY") })).max(3).default([]),
  }),
  assetSources: z.array(assetSourceSchema).max(100).default([]),
}).superRefine((value, context) => {
  const expectedPrefix = `contents/${value.content.contentKey}/`;
  const usedPaths = new Set(value.assetSources.filter((source) => source.usedInService && source.storagePath).map((source) => source.storagePath));
  const contentPaths = [value.content.thumbnailImageStoragePath, value.content.heroImageStoragePath];
  for (const block of value.content.bodyBlocks) {
    if (block.type === "image") contentPaths.push(block.storagePath);
    if (block.type === "image_gallery") contentPaths.push(...block.images.map((image) => image.storagePath));
  }
  for (const path of contentPaths.filter((item): item is string => item !== null)) {
    if (!path.startsWith(expectedPrefix)) context.addIssue({ code: "custom", message: "이미지 경로와 contentKey가 일치하지 않습니다." });
    if (!usedPaths.has(path)) context.addIssue({ code: "custom", message: `사용 이미지의 출처가 없습니다: ${path}` });
  }
});

export const uploadMetadataSchema = z.object({
  contentKey: keySchema,
  assetKey: z.enum(["thumbnail", "hero"]).or(z.string().regex(/^body-\d{2}$/)),
});

export type PublishRequest = z.infer<typeof publishRequestSchema>;
export type QueueUpdate = z.infer<typeof queueUpdateSchema>;
