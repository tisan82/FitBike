import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(new URL("../../src/repositories/content-factory.repository.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../../supabase/migrations/20260905121603_content_factory_publish_api.sql", import.meta.url), "utf8");
const routes = await Promise.all([
  "../../src/app/api/internal/content-factory/queue/next/route.ts",
  "../../src/app/api/internal/content-factory/queue/[topicKey]/route.ts",
  "../../src/app/api/internal/content-factory/assets/route.ts",
  "../../src/app/api/internal/content-factory/publish/route.ts",
].map(async (path) => readFile(new URL(path, import.meta.url), "utf8")));

test("repository is limited to fixed content RPCs and content-assets", () => {
  assert.match(repository, /const BUCKET = "content-assets"/);
  assert.deepEqual(
    [...repository.matchAll(/\.rpc\("([^"]+)"/g)].map((match) => match[1]).sort(),
    ["content_factory_next_topic_v1", "content_factory_publish_v1", "content_factory_update_topic_v1"],
  );
  assert.doesNotMatch(repository, /\.from\("(?:auth\.|profiles|0[1-9]_bike|1[01]_bike|0[4-9]_.*fitment)/i);
});

test("every Content Factory route fails closed behind shared bearer auth", () => {
  for (const route of routes) assert.match(route, /contentFactoryAuthError\(request\)/);
});

test("RPC execution is denied to public roles and only granted to service_role", () => {
  assert.match(migration, /revoke all on function public\.content_factory_publish_v1\(jsonb\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.content_factory_publish_v1\(jsonb\) to service_role/);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete).*"(?:0[1-9]|1[01])_/i);
});

test("publish RPC only mutates content, relation, queue, and source tables", () => {
  const mutated = [...migration.matchAll(/(?:insert into|update)\s+public\."([^"]+)"/gi)].map((match) => match[1]);
  assert.deepEqual([...new Set(mutated)].sort(), [
    "12_content",
    "13_content_bike_model",
    "14_content_bike_model_year",
    "15_content_part_link",
    "16_content_topic",
    "17_content_asset_source",
  ]);
});
