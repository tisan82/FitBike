import { createHash, timingSafeEqual } from "node:crypto";

export type ContentFactoryAuthResult =
  | { ok: true }
  | { ok: false; reason: "MISSING_SERVER_TOKEN" | "UNAUTHORIZED" };

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

export function authorizeContentFactory(request: Request): ContentFactoryAuthResult {
  const configuredToken = process.env.CONTENT_FACTORY_PUBLISH_TOKEN;
  if (!configuredToken) return { ok: false, reason: "MISSING_SERVER_TOKEN" };

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return { ok: false, reason: "UNAUTHORIZED" };

  const suppliedToken = authorization.slice("Bearer ".length);
  return timingSafeEqual(digest(suppliedToken), digest(configuredToken))
    ? { ok: true }
    : { ok: false, reason: "UNAUTHORIZED" };
}
