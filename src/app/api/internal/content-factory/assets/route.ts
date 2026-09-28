import { authorizeContentFactory } from "@/lib/content-factory/auth";
import { errorResponse, successResponse } from "@/lib/api/response";
import { uploadMetadataSchema } from "@/lib/content-factory/schemas";
import {
  ContentFactoryConflictError,
  ContentFactoryValidationError,
  storeContentFactoryAsset,
  verifyScheduledAssetUploadTicket,
} from "@/services/content-factory.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const metadata = uploadMetadataSchema.safeParse({
      contentKey: form.get("contentKey"),
      assetKey: form.get("assetKey"),
    });
    const file = form.get("file");

    if (!metadata.success || !(file instanceof File)) {
      return errorResponse("VALIDATION_ERROR", "이미지 업로드 요청이 올바르지 않습니다.", 422);
    }

    const legacyAuth = authorizeContentFactory(request);
    if (!legacyAuth.ok) {
      const pipelineId = Number(form.get("pipelineId"));
      const ticket = request.headers.get("x-fitbike-upload-ticket") ?? "";
      const ticketOk = await verifyScheduledAssetUploadTicket(
        pipelineId,
        metadata.data.contentKey,
        metadata.data.assetKey,
        ticket,
      );
      if (!ticketOk) {
        return errorResponse("UNAUTHORIZED", "유효한 Content Factory 인증이 필요합니다.", 401);
      }
    }

    return successResponse(
      await storeContentFactoryAsset(metadata.data.contentKey, metadata.data.assetKey, file),
      201,
    );
  } catch (error) {
    if (error instanceof ContentFactoryValidationError) {
      return errorResponse("VALIDATION_ERROR", error.message, 422);
    }
    if (error instanceof ContentFactoryConflictError) {
      return errorResponse("ASSET_CONFLICT", error.message, 409);
    }
    console.error("Content Factory asset upload failed", error);
    return errorResponse("INTERNAL_ERROR", "이미지를 저장하지 못했습니다.", 500);
  }
}
