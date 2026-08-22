import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/u)) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/gu, "");
}

const pageUrl = "http://localhost:3001/tire-detail/model/MAXXIS_MA_RS";
const pageResponse = await fetch(pageUrl);
const html = await pageResponse.text();
const files = ["main.webp", "sub-01.webp", "sub-02.webp"];
const results = [];

for (const file of files) {
  const objectPath = `tire-models/maxxis/MAXXIS_MA_RS/${file}`;
  const storageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tire-assets/${objectPath}`;
  const storageResponse = await fetch(storageUrl, { method: "HEAD" });
  const optimizerUrl = `http://localhost:3001/_next/image?url=${encodeURIComponent(storageUrl)}&w=1200&q=75`;
  const optimizerResponse = await fetch(optimizerUrl, { method: "HEAD" });
  results.push({
    file,
    storageStatus: storageResponse.status,
    storageType: storageResponse.headers.get("content-type"),
    optimizerStatus: optimizerResponse.status,
    optimizerType: optimizerResponse.headers.get("content-type"),
    htmlIndex: html.indexOf(file),
  });
}

console.log(JSON.stringify({
  page: { url: pageUrl, status: pageResponse.status },
  results,
  order: {
    hero: html.indexOf("main.webp"),
    sku: html.indexOf("내 타이어 규격 선택"),
    features: html.indexOf("주요 특징"),
    sub01: html.indexOf("sub-01.webp"),
    sizeGuide: html.indexOf("타이어 규격 보는 법"),
    sub02: html.indexOf("sub-02.webp"),
  },
  wrongBikeAssetsResolution: html.includes("/bike-assets/tire-models/"),
}, null, 2));
