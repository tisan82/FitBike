import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const sourcePath = path.join(root, "assets-source/tire-models/maxxis/original/MAXXIS_MA_RS_official_distributor_hd.png");
const reviewDirectory = path.join(root, "assets-source/tire-models/maxxis/review/MAXXIS_MA_RS");

fs.mkdirSync(reviewDirectory, { recursive: true });

const mainProduct = await sharp(sourcePath)
  .resize({ height: 980, fit: "inside", kernel: sharp.kernel.lanczos3 })
  .png()
  .toBuffer();

await sharp({ create: { width: 1200, height: 1200, channels: 3, background: "#ffffff" } })
  .composite([{ input: mainProduct, gravity: "center" }])
  .webp({ quality: 90, effort: 6 })
  .withMetadata({ icc: "srgb" })
  .toFile(path.join(reviewDirectory, "main-candidate-v2.webp"));

const subProduct = await sharp(sourcePath)
  .resize({ height: 520, fit: "inside", kernel: sharp.kernel.lanczos3 })
  .png()
  .toBuffer();

const subOverlay = Buffer.from(`
<svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
  <style>
    .headline { font-family: "Malgun Gothic", "Noto Sans KR", sans-serif; font-size: 48px; font-weight: 700; fill: #16181c; }
    .support { font-family: "Malgun Gothic", "Noto Sans KR", sans-serif; font-size: 28px; font-weight: 500; fill: #525862; }
    .chip { font-family: Arial, sans-serif; font-size: 22px; font-weight: 700; fill: #242830; letter-spacing: 0.4px; }
  </style>
  <text x="76" y="180" class="headline">트랙을 위한 슬릭 구성</text>
  <text x="76" y="238" class="support">17인치 전륜 2종 · 후륜 3종의</text>
  <text x="76" y="278" class="support">튜브리스 SKU</text>
  <g>
    <rect x="76" y="342" width="126" height="52" rx="26" fill="#ffffff" stroke="#d7dbe1"/>
    <text x="139" y="375" text-anchor="middle" class="chip">SLICK</text>
    <rect x="214" y="342" width="152" height="52" rx="26" fill="#ffffff" stroke="#d7dbe1"/>
    <text x="290" y="375" text-anchor="middle" class="chip">17 INCH</text>
    <rect x="76" y="410" width="174" height="52" rx="26" fill="#ffffff" stroke="#d7dbe1"/>
    <text x="163" y="443" text-anchor="middle" class="chip">TUBELESS</text>
  </g>
</svg>`);

await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#f5f6f8" } })
  .composite([
    { input: subProduct, left: 645, top: 190 },
    { input: subOverlay, left: 0, top: 0 },
  ])
  .webp({ quality: 90, effort: 6 })
  .withMetadata({ icc: "srgb" })
  .toFile(path.join(reviewDirectory, "sub-01-candidate-final.webp"));

console.log("MA-RS V2 review candidates created from the approved HD source");
