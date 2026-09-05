import { authorizeContentFactory } from "@/lib/content-factory/auth";
import { errorResponse } from "@/lib/api/response";

export function contentFactoryAuthError(request: Request) {
  const result = authorizeContentFactory(request);
  if (result.ok) return null;
  if (result.reason === "MISSING_SERVER_TOKEN") {
    return errorResponse("SERVICE_UNAVAILABLE", "Content Factory 인증이 구성되지 않았습니다.", 503);
  }
  return errorResponse("UNAUTHORIZED", "유효한 Content Factory 인증이 필요합니다.", 401);
}

export function noStoreHeaders() {
  return { "Cache-Control": "no-store" };
}
