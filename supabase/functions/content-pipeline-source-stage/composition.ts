import {
  CompositeOperator,
  ImageMagick,
  MagickColor,
  MagickFormat,
  Point,
} from "npm:@imagemagick/magick-wasm@0.0.42";
import { downloadSource, sourceUrl } from "./source.ts";
import {
  renderSvg,
  sha256,
  transformSource,
  validateTransform,
} from "./transform.ts";
import { compositionFontBase64 } from "./composition-font.ts";
export type Panel = {
  sourceAssetUrl: string;
  sourcePageUrl: string;
  sourceOwner: string;
  verifiedFacts: string[];
  pixelsInspected: true;
  checkedAt: string;
  expectedSourceSha?: string;
  crop?: { x: number; y: number; width: number; height: number };
  label?: string;
};
export type Composition = { layout: "SIDE_BY_SIDE"; sources: Panel[] };
export function validateComposition(raw: unknown): Composition {
  const c = raw as Composition;
  if (
    !c || c.layout !== "SIDE_BY_SIDE" ||
    Object.keys(c).some((k) => !["layout", "sources"].includes(k)) ||
    !Array.isArray(c.sources) || c.sources.length < 2 || c.sources.length > 3
  ) throw Error("INVALID_SOURCE_COMPOSITION");
  const seen = new Set<string>();
  for (const p of c.sources) {
    if (
      !p || Object.keys(p).some((k) =>
        ![
          "sourceAssetUrl",
          "sourcePageUrl",
          "sourceOwner",
          "verifiedFacts",
          "pixelsInspected",
          "checkedAt",
          "expectedSourceSha",
          "crop",
          "label",
        ].includes(k)
      )
    ) throw Error("INVALID_COMPOSITION_SOURCE");
    const asset = sourceUrl(p.sourceAssetUrl).href;
    sourceUrl(p.sourcePageUrl);
    if (seen.has(asset)) throw Error("COMPOSITION_DUPLICATE_SOURCE");
    seen.add(asset);
    if (
      typeof p.sourceOwner !== "string" || !p.sourceOwner.trim() ||
      p.sourceOwner.length > 500 ||
      p.pixelsInspected !== true || !Array.isArray(p.verifiedFacts) ||
      !p.verifiedFacts.length || p.verifiedFacts.length > 8 ||
      p.verifiedFacts.some((f) =>
        typeof f !== "string" || !f.trim() || f.length > 500
      ) || typeof p.checkedAt !== "string" ||
      !Number.isFinite(Date.parse(p.checkedAt))
    ) throw Error("COMPOSITION_VERIFICATION_REQUIRED");
    if (
      p.expectedSourceSha !== undefined &&
      !/^[a-f0-9]{64}$/.test(p.expectedSourceSha)
    ) throw Error("INVALID_SOURCE_SHA");
    validateTransform(p.crop ? { crop: p.crop } : {});
    // Fixed embedded font: reject unsupported glyphs instead of silently losing labels.
    if (
      p.label !== undefined &&
      (typeof p.label !== "string" ||
        !/^[A-Za-z0-9 &()+.,/-]{1,24}$/.test(p.label))
    ) throw Error("COMPOSITION_LABEL_UNSUPPORTED");
  }
  return c;
}
export async function composeSources(
  raw: unknown,
  width = 1170,
  download = downloadSource,
) {
  const c = validateComposition(raw);
  if (!Number.isInteger(width) || width < 780 || width > 1600) {
    throw Error("COMPOSITION_WIDTH_INVALID");
  }
  const height = Math.round(width * 9 / 16),
    pad = Math.round(width * .04),
    gap = Math.round(width * .025);
  const pw = Math.floor(
    (width - pad * 2 - gap * (c.sources.length - 1)) / c.sources.length,
  );
  const labelHeight = c.sources.some((p) => p.label)
    ? Math.round(width * .08)
    : 0;
  const ph = height - pad * 2 - labelHeight;
  const panels = [], provenance = [], hashes = new Set<string>();
  // Sequential bounded downloads avoid multiplying WASM memory/CPU peaks.
  for (const p of c.sources) {
    const d = await download(p.sourceAssetUrl);
    if (d.mime === "application/pdf") {
      throw Error("COMPOSITION_RASTER_REQUIRED");
    }
    const hash = await sha256(d.bytes);
    if (p.expectedSourceSha && p.expectedSourceSha !== hash) {
      throw Error("COMPOSITION_SOURCE_SHA_MISMATCH");
    }
    if (hashes.has(hash)) throw Error("COMPOSITION_DUPLICATE_SOURCE_SHA");
    hashes.add(hash);
    const panel = await transformSource(d.bytes, d.mime, {
      ...(p.crop ? { crop: p.crop } : {}),
      maxWidth: pw,
    });
    panels.push(panel);
    provenance.push({
      ...p,
      sourceSha256: hash,
      sourceMime: d.mime,
      finalSourceAssetUrl: d.finalUrl,
      sourceRedirects: d.redirects,
      sourceCheckedAt: new Date().toISOString(),
    });
  }
  const font = Uint8Array.from(
    atob(compositionFontBase64),
    (v) => v.charCodeAt(0),
  );
  const esc = (s: string) =>
    s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const overlay = labelHeight
    ? await renderSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${
        c.sources.map((p, i) =>
          p.label
            ? `<text x="${pad + i * (pw + gap) + pw / 2}" y="${
              height - pad - labelHeight * .25
            }" text-anchor="middle" fill="#17212b" font-family="DejaVu Sans" font-size="${
              Math.round(width * .038)
            }">${esc(p.label)}</text>`
            : ""
        ).join("")
      }</svg>`,
      [font],
      true,
    )
    : null;
  const webp = ImageMagick.read(
    new MagickColor("white"),
    width,
    height,
    (canvas) => {
      panels.forEach((p, i) =>
        ImageMagick.read(p.webp, (img) => {
          const scale = Math.min(1, pw / img.width, ph / img.height);
          if (scale < 1) {
            img.resize(
              Math.round(img.width * scale),
              Math.round(img.height * scale),
            );
          }
          canvas.composite(
            img,
            CompositeOperator.Over,
            new Point(
              pad + i * (pw + gap) + Math.round((pw - img.width) / 2),
              pad + Math.round((ph - img.height) / 2),
            ),
          );
        })
      );
      if (overlay) {
        ImageMagick.read(
          overlay,
          (img) => canvas.composite(img, CompositeOperator.Over),
        );
      }
      canvas.quality = 84;
      canvas.settings.setDefine(MagickFormat.WebP, "method", "0");
      return canvas.write(MagickFormat.WebP, (b) => Uint8Array.from(b));
    },
  );
  return { webp, width, height, provenance, recipe: c };
}
