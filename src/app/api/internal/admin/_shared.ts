import { errorResponse } from "@/lib/api/response";
import { hasConfiguredAdmins, verifyAdminRequest } from "@/lib/admin/auth";

export async function requireAdmin(request: Request) {
  if (!hasConfiguredAdmins()) {
    return { identity: null, response: errorResponse("ADMIN_NOT_CONFIGURED", "관리자 인증이 구성되지 않았습니다.", 503) };
  }
  try {
    const identity = await verifyAdminRequest(request);
    if (!identity) return { identity: null, response: errorResponse("UNAUTHORIZED", "관리자 인증이 필요합니다.", 401) };
    return { identity, response: null };
  } catch (error) {
    console.error("Admin authentication failed", error);
    return { identity: null, response: errorResponse("AUTHENTICATION_FAILED", "관리자 인증을 확인하지 못했습니다.", 503) };
  }
}
