import {
  findNextContentFactoryTopic,
  publishContentFactoryPackage,
  updateContentFactoryTopic,
  uploadContentFactoryAsset,
} from "@/repositories/content-factory.repository";
import type { PublishRequest, QueueUpdate } from "@/lib/content-factory/schemas";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export class ContentFactoryConflictError extends Error {}
export class ContentFactoryValidationError extends Error {}

export async function getNextContentFactoryTopic() {
  return findNextContentFactoryTopic();
}

export async function transitionContentFactoryTopic(topicKey: string, update: QueueUpdate) {
  return updateContentFactoryTopic(topicKey, update);
}

export async function publishContentFactory(payload: PublishRequest) {
  if (new Date(payload.content.publishedAt).getTime() > Date.now() + 60_000) {
    throw new ContentFactoryValidationError("publishedAt은 현재 시각보다 미래일 수 없습니다.");
  }
  return publishContentFactoryPackage(payload);
}

export async function storeContentFactoryAsset(contentKey: string, assetKey: string, file: File) {
  if (file.type !== "image/webp") throw new ContentFactoryValidationError("WebP 이미지만 업로드할 수 있습니다.");
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) throw new ContentFactoryValidationError("이미지는 4MB 이하여야 합니다.");
  const objectPath = `contents/${contentKey}/${assetKey}.webp`;
  try {
    return await uploadContentFactoryAsset(objectPath, new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_FACTORY_ASSET_CONFLICT") {
      throw new ContentFactoryConflictError("같은 경로에 다른 이미지가 이미 존재합니다.");
    }
    throw error;
  }
}
