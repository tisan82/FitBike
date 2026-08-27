import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);

function parseArguments(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) throw new Error("INVALID_ARGUMENTS");
    args[argv[index].slice(2)] = argv[index + 1];
  }
  return args;
}

async function loadEnvironment(projectDirectory) {
  const file = path.join(projectDirectory, ".env.local");
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && process.env[match[1].trim()] === undefined) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
}

function inspectDetailHtml(html, canonicalUrl) {
  return {
    canonical: html.includes(`rel="canonical" href="${canonicalUrl}"`) || html.includes(`href="${canonicalUrl}" rel="canonical"`),
    articleJsonLd: /"@type"\s*:\s*"Article"/.test(html) || /&quot;@type&quot;\s*:\s*&quot;Article&quot;/.test(html),
    mobileViewport: /name="viewport"/.test(html),
    contentIntegrity: html.length > 1000 && !/Application error|Internal Server Error/i.test(html)
  };
}

async function fetchResult(url, options = {}) {
  const response = await fetch(url, { redirect: "follow", ...options });
  return { response, text: options.method === "HEAD" ? "" : await response.text() };
}

async function runChecks({ origin, contentKey, assetUrls, fetcher = fetchResult }) {
  const canonicalUrl = `${origin}/contents/${contentKey}`;
  const [detail, directory, sitemap, robots, ...assets] = await Promise.all([
    fetcher(canonicalUrl, { headers: { "User-Agent": "FitBike-Autonomous-Production-QA/1.0" } }),
    fetcher(`${origin}/contents`),
    fetcher(`${origin}/sitemap.xml`),
    fetcher(`${origin}/robots.txt`),
    ...assetUrls.map((url) => fetcher(url, { method: "HEAD" }))
  ]);
  const html = inspectDetailHtml(detail.text, canonicalUrl);
  const checks = {
    detailHttp200: detail.response.status === 200,
    directoryHttp200: directory.response.status === 200,
    directoryExposure: directory.text.includes(`/contents/${contentKey}`),
    canonical: html.canonical,
    articleJsonLd: html.articleJsonLd,
    sitemapHttp200: sitemap.response.status === 200,
    sitemapExposure: sitemap.text.includes(canonicalUrl),
    robotsHttp200: robots.response.status === 200,
    robotsAllowsContent: !/Disallow:\s*\/contents(?:\s|$)/i.test(robots.text),
    internalLinkNotOrphan: directory.text.includes(`/contents/${contentKey}`),
    mobileViewport: html.mobileViewport,
    contentIntegrity: html.contentIntegrity,
    assetHttp200: assets.every((asset) => asset.response.status === 200),
    assetWebp: assets.every((asset) => asset.response.headers.get("content-type") === "image/webp")
  };
  const propagationChecks = ["directoryExposure", "sitemapExposure", "internalLinkNotOrphan"];
  const allPass = Object.values(checks).every(Boolean);
  const onlyPropagationPending = Object.entries(checks).every(([key, value]) => value || propagationChecks.includes(key));
  return { status: allPass ? "PASS" : onlyPropagationPending ? "PRODUCTION_QA_PENDING" : "PRODUCTION_QA_FAILED", checks };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args["content-dir"]) throw new Error("--content-dir is required");
  const projectDirectory = path.resolve(path.dirname(scriptPath), "../..");
  await loadEnvironment(projectDirectory);
  const contentDirectory = path.resolve(args["content-dir"]);
  const result = JSON.parse(await readFile(path.join(contentDirectory, "publish-result.json"), "utf8"));
  const origin = (args.origin ?? "https://fitbike.co.kr").replace(/\/$/, "");
  const storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!storageOrigin) throw new Error("STORAGE_ORIGIN_UNAVAILABLE");
  const assetUrls = result.storage.assets.map((asset) => `${storageOrigin}/storage/v1/object/public/${result.storage.bucket}/${asset.objectPath}`);
  const attempts = Number(args.attempts ?? 6);
  const retryMs = Number(args["retry-ms"] ?? 50000);
  let review;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    review = await runChecks({ origin, contentKey: result.contentKey, assetUrls });
    if (review.status === "PASS" || review.status === "PRODUCTION_QA_FAILED") break;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  console.log(JSON.stringify({ ...review, attempts, contentKey: result.contentKey }, null, 2));
  if (review.status !== "PASS") process.exitCode = 2;
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

export { inspectDetailHtml, runChecks };
