import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auth = await readFile(new URL("../../src/lib/admin/auth.ts", import.meta.url), "utf8");
const repository = await readFile(new URL("../../src/repositories/admin-operations.repository.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../../supabase/migrations/20260906001743_add_admin_operations_overview.sql", import.meta.url), "utf8");
const routes = await Promise.all([
  "../../src/app/api/internal/admin/session/route.ts",
  "../../src/app/api/internal/admin/operations/route.ts",
  "../../src/app/api/internal/admin/topics/[topicKey]/route.ts",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));

test("admin identity is verified by Supabase on the server", () => {
  assert.match(auth, /auth\.getUser\(token\)/);
  assert.match(auth, /process\.env\.ADMIN_EMAILS/);
  assert.doesNotMatch(auth, /user_metadata/);
});

test("every internal admin route requires server authorization", () => {
  for (const route of routes) assert.match(route, /await requireAdmin\(request\)/);
});

test("operations repository only calls scoped content operations RPCs", () => {
  assert.deepEqual(
    [...repository.matchAll(/\.rpc\("([^"]+)"/g)].map((match) => match[1]).sort(),
    ["admin_operations_overview_v1", "content_factory_update_topic_v1"],
  );
  assert.doesNotMatch(repository, /auth\.|profile|member|fitment|0[1-9]_bike|07_bike/i);
});

test("operations overview RPC is service-role only", () => {
  assert.match(migration, /revoke all on function public\.admin_operations_overview_v1\(\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.admin_operations_overview_v1\(\) to service_role/);
  assert.doesNotMatch(migration, /auth\.users|profile|member|fitment/i);
});
