import { labelFont } from "./label-font.ts";
import {
  CompositeOperator,
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
  MagickImageInfo,
} from "npm:@imagemagick/magick-wasm@0.0.42";
const wasm = await Deno.readFile(
  new URL(
    "magick.wasm",
    import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42"),
  ),
);
await initializeImageMagick(wasm);
let svgReady = false;
let svgModule: typeof import("npm:@resvg/resvg-wasm@2.6.2");
export async function renderSvg(svg: string, fontBuffers: Uint8Array[] = [], transparent = false) {
  if (!svgReady) {
    svgModule = await import("npm:@resvg/resvg-wasm@2.6.2");
    await svgModule.initWasm(
      await Deno.readFile(
        new URL(
          "index_bg.wasm",
          import.meta.resolve("npm:@resvg/resvg-wasm@2.6.2"),
        ),
      ),
    );
    svgReady = true;
  }
  const renderer = new svgModule.Resvg(svg, {
    background: fontBuffers.length && !transparent ? "white" : undefined,
    font: { fontBuffers },
  });
  try {
    const rendered = renderer.render();
    try {
      return rendered.asPng();
    } finally {
      rendered.free();
    }
  } finally {
    renderer.free();
  }
}
// PDF.js SVGGraphics' third argument is forceDataSchema, NOT embedFonts.
// resvg-wasm cannot resolve SVG @font-face URLs. Load the exact PDF font bytes
// explicitly and replace PDF.js' synthetic family IDs with their sfnt names.
// Do not substitute system fonts: missing fonts must fail instead of hiding text.
export function pdfFontFamily(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const valid = (offset: number, length: number) =>
    offset >= 0 && length >= 0 && offset + length <= bytes.length;
  if (!valid(0, 12)) throw Error("PDF_FONT_INVALID");
  const count = view.getUint16(4);
  if (!valid(12, count * 16)) throw Error("PDF_FONT_INVALID");
  for (let i = 0; i < count; i++) {
    const entry = 12 + i * 16;
    if (new TextDecoder().decode(bytes.subarray(entry, entry + 4)) !== "name") {
      continue;
    }
    const offset = view.getUint32(entry + 8),
      length = view.getUint32(entry + 12);
    if (!valid(offset, length) || length < 6) throw Error("PDF_FONT_INVALID");
    const records = view.getUint16(offset + 2),
      storage = view.getUint16(offset + 4);
    if (6 + records * 12 > length || storage > length) {
      throw Error("PDF_FONT_INVALID");
    }
    for (let j = 0; j < records; j++) {
      const record = offset + 6 + j * 12;
      const platform = view.getUint16(record),
        nameId = view.getUint16(record + 6);
      if (nameId !== 1 || ![0, 3].includes(platform)) continue;
      const size = view.getUint16(record + 8),
        position = storage + view.getUint16(record + 10);
      if (!size || size % 2 || position + size > length) {
        throw Error("PDF_FONT_INVALID");
      }
      const name = new TextDecoder("utf-16be").decode(
        bytes.subarray(offset + position, offset + position + size),
      );
      if (!name.trim() || /[\x00-\x1f]/.test(name)) {
        throw Error("PDF_FONT_INVALID");
      }
      return name;
    }
  }
  throw Error("PDF_FONT_FAMILY_UNAVAILABLE");
}
export type Transform = {
  crop?: { x: number; y: number; width: number; height: number };
  maxWidth?: number;
  annotations?: Array<
    { type: "circle"; x: number; y: number; radius: number } | {
      type: "arrow";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    } | { type: "label"; text: string; x: number; y: number; fontSize?: number }
  >;
};
const unit = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
export function validateTransform(raw: unknown): Transform {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw Error("INVALID_TRANSFORM");
  }
  const t = raw as Transform;
  if (
    Object.keys(t).some((k) => !["crop", "maxWidth", "annotations"].includes(k))
  ) throw Error("UNSUPPORTED_TRANSFORM");
  if (
    t.maxWidth !== undefined &&
    (!Number.isInteger(t.maxWidth) || t.maxWidth < 390 || t.maxWidth > 1600)
  ) throw Error("INVALID_MAX_WIDTH");
  if (t.crop) {
    const c = t.crop;
    if (
      ![c.x, c.y, c.width, c.height].every(unit) || c.width <= 0 ||
      c.height <= 0 || c.x + c.width > 1 || c.y + c.height > 1
    ) throw Error("INVALID_CROP");
  }
  if (t.annotations) {
    if (!Array.isArray(t.annotations) || t.annotations.length > 6) {
      throw Error("INVALID_ANNOTATION");
    }
    for (const a of t.annotations) {
      if (a.type === "circle") {
        if (
          ![a.x, a.y, a.radius].every(unit) || a.radius <= 0 || a.radius > 0.5
        ) throw Error("INVALID_ANNOTATION");
      } else if (a.type === "arrow") {
        if (
          ![a.x1, a.y1, a.x2, a.y2].every(unit) ||
          a.x1 === a.x2 && a.y1 === a.y2
        ) throw Error("INVALID_ANNOTATION");
      } else if (a.type === "label") {
        if (!unit(a.x) || !unit(a.y) || typeof a.text !== "string" ||
            !/^[\x20-\x7e\u3131-\u318e\uac00-\ud7a3]{1,16}$/.test(a.text.normalize("NFC")) || !a.text.trim() ||
            (a.fontSize !== undefined && (!Number.isInteger(a.fontSize) || a.fontSize < 14 || a.fontSize > 24)) ||
            Object.keys(a).some(k => !["type", "text", "x", "y", "fontSize"].includes(k))) throw Error("INVALID_LABEL");
      } else throw Error("UNSUPPORTED_ANNOTATION");
    }
  }
  return t;
}
export async function transformSource(
  bytes: Uint8Array,
  mime: string,
  t: Transform,
  pageNo?: number,
) {
  let input = bytes;
  if (
    mime === "application/pdf" &&
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) throw Error("SOURCE_SIGNATURE_INVALID");
  if (mime === "application/pdf") {
    if (!Number.isInteger(pageNo) || pageNo! < 1 || pageNo! > 500) {
      throw Error("PDF_PAGE_REQUIRED");
    }
    const { parseHTML } = await import("npm:linkedom@0.18.12");
    const pdfjsImport = await import(
      "npm:pdfjs-dist@3.11.174/legacy/build/pdf.js"
    );
    const { document, window } = parseHTML(
      "<html><body></body></html>",
    ) as unknown as { document: unknown; window: { DOMParser: unknown } };
    Object.assign(globalThis, {
      document,
      window,
      DOMParser: window.DOMParser,
      navigator: { userAgent: "FitBike PDF Renderer" },
    });
    type Pdf = {
      getDocument(
        o: unknown,
      ): {
        promise: Promise<
          {
            numPages: number;
            destroy(): Promise<void>;
            getPage(
              n: number,
            ): Promise<
              {
                getViewport(o: unknown): { width: number; height: number };
                getOperatorList(): Promise<unknown>;
                commonObjs: unknown;
                objs: unknown;
              }
            >;
          }
        >;
      };
      SVGGraphics: new (
        a: unknown,
        b: unknown,
        c: boolean,
      ) => {
        embedFonts: boolean;
        embeddedFonts: Record<string, { data?: Uint8Array }>;
        getSVG(a: unknown, b: unknown): Promise<{
          outerHTML?: string;
          querySelectorAll(selector: string): Iterable<{
            textContent: string | null;
            getAttribute(name: string): string | null;
            setAttribute(name: string, value: string): void;
          }>;
        }>;
      };
    };
    const pdfModule = pdfjsImport as unknown as Pdf & { default?: Pdf },
      pdfjs = pdfModule.default ?? pdfModule;
    const pdf = await pdfjs.getDocument({
      data: bytes,
      disableWorker: true,
      fontExtraProperties: true,
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
    try {
      if (pageNo! > pdf.numPages) throw Error("PDF_PAGE_OUT_OF_RANGE");
      const page = await pdf.getPage(pageNo!),
        v = page.getViewport({ scale: 1.5 });
      if (v.width * v.height > 4000000) throw Error("PDF_PAGE_TOO_LARGE");
      const graphics = new pdfjs.SVGGraphics(page.commonObjs, page.objs, true);
      graphics.embedFonts = true;
      const svg = await graphics.getSVG(await page.getOperatorList(), v);
      const fontBuffers: Uint8Array[] = [];
      const families = new Map<string, string>();
      const familyHashes = new Map<string, string>();
      for (const [id, font] of Object.entries(graphics.embeddedFonts)) {
        if (!font.data?.length) throw Error("PDF_FONT_UNAVAILABLE");
        const family = pdfFontFamily(font.data),
          identity = await sha256(font.data);
        if (familyHashes.has(family) && familyHashes.get(family) !== identity) {
          throw Error("PDF_FONT_FAMILY_COLLISION");
        }
        familyHashes.set(family, identity);
        families.set(id, family);
        fontBuffers.push(font.data);
      }
      for (const node of svg.querySelectorAll("[font-family]")) {
        const family = families.get(node.getAttribute("font-family") ?? "");
        if (!family && node.textContent?.trim()) {
          throw Error("PDF_FONT_UNAVAILABLE");
        }
        if (family) node.setAttribute("font-family", `"${family}"`);
      }
      let text = (svg.outerHTML || String(svg)).replaceAll("svg:", "");
      if (!text.includes("xmlns=")) {
        text = text.replace(
          "<svg ",
          '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ',
        );
      }
      input = await renderSvg(text, fontBuffers);
    } finally {
      await pdf.destroy();
    }
  }
  const header = MagickImageInfo.create(input);
  const expectedFormat = mime === "image/jpeg"
    ? MagickFormat.Jpeg
    : mime === "image/webp"
    ? MagickFormat.WebP
    : MagickFormat.Png;
  if (
    header.format !== expectedFormat || header.width < 1 || header.height < 1 ||
    header.width * header.height > 8000000
  ) throw Error("SOURCE_DIMENSIONS_OR_FORMAT_INVALID");
  // Compute output geometry before allocating the annotation overlay. Decode the
  // source once, composite once and encode WebP once; no intermediate PNG roundtrips.
  const cw = t.crop
    ? Math.max(1, Math.floor(t.crop.width * header.width))
    : header.width;
  const ch = t.crop
    ? Math.max(1, Math.floor(t.crop.height * header.height))
    : header.height;
  const outputRatio = Math.min(1, (t.maxWidth ?? 780) / cw, 1600 / ch);
  const width = Math.max(1, Math.round(cw * outputRatio));
  const height = Math.max(1, Math.round(ch * outputRatio));
  if (width * height > 2000000) throw Error("TRANSFORM_OUTPUT_TOO_LARGE");
  let overlay: Uint8Array | undefined;
  if (t.annotations?.length) {
    const scale = Math.min(width, height),
      stroke = Math.max(4, Math.round(width * 0.009));
    const shapes = t.annotations.filter(a => a.type !== "label").map((a) =>
      a.type === "circle"
        ? `<circle cx="${a.x * width}" cy="${a.y * height}" r="${
          a.radius * scale
        }"/>`
        : `<path d="M ${a.x1 * width} ${a.y1 * height} L ${a.x2 * width} ${
          a.y2 * height
        }" marker-end="url(#head)"/>`
    ).join("");
    const escapeXml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
    const labels = t.annotations.filter(a => a.type === "label").map(a => {
      // fontSize is in pixels at 390px display width, independent of output size.
      const size = (a.fontSize ?? 16) * width / 390;
      const text = a.text.normalize("NFC");
      const boxWidth = (Array.from(text).length + 1) * size, boxHeight = size * 1.8;
      if (boxWidth > width || boxHeight > height) throw Error("LABEL_DOES_NOT_FIT");
      const x = Math.min(a.x * width, width - boxWidth), y = Math.min(a.y * height, height - boxHeight);
      return `<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="${size * .2}" fill="#111827"/><text x="${x + size * .5}" y="${y + size * 1.25}" font-family="Noto Sans KR" font-size="${size}" font-weight="600" fill="white">${escapeXml(text)}</text>`;
    }).join("");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><marker id="head" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill="#facc15"/></marker></defs><g fill="none" stroke="#111827" stroke-width="${
        stroke + 4
      }">${shapes}</g><g fill="none" stroke="#facc15" stroke-width="${stroke}">${shapes}</g>${labels}</svg>`;
    overlay = await renderSvg(svg, labels ? [await labelFont()] : [], true);
  }
  const webp = ImageMagick.read(input, (img) => {
    if (t.crop) {
      const c = t.crop;
      img.crop(
        new MagickGeometry(
          Math.floor(c.x * img.width),
          Math.floor(c.y * img.height),
          Math.max(1, Math.floor(c.width * img.width)),
          Math.max(1, Math.floor(c.height * img.height)),
        ),
      );
      img.resetPage();
    }
    const ratio = Math.min(
      1,
      (t.maxWidth ?? 780) / img.width,
      1600 / img.height,
    );
    if (ratio < 1) {
      img.resize(
        Math.max(1, Math.round(img.width * ratio)),
        Math.max(1, Math.round(img.height * ratio)),
      );
    }
    if (overlay) {
      ImageMagick.read(
        overlay,
        (layer) => img.composite(layer, CompositeOperator.Over),
      );
    }
    img.quality = 84;
    // Low-effort encoder preserves WebP quality while keeping the CPU budget bounded.
    img.settings.setDefine(MagickFormat.WebP, "method", "0");
    return img.write(MagickFormat.WebP, (d) => Uint8Array.from(d));
  });
  return { webp, width, height };
}
export async function inspectWebp(b: Uint8Array, mime: string) {
  if (
    mime !== "image/webp" || b.length < 12 || b.length > 4194304 ||
    new TextDecoder().decode(b.slice(0, 4)) !== "RIFF" ||
    new TextDecoder().decode(b.slice(8, 12)) !== "WEBP"
  ) throw Error("INVALID_WEBP");
  const header = MagickImageInfo.create(b);
  if (
    header.format !== MagickFormat.WebP || header.width < 1 ||
    header.height < 1 || header.width * header.height > 8000000
  ) {
    throw Error("WEBP_DIMENSIONS_TOO_LARGE");
  }
  let width = 0, height = 0;
  ImageMagick.read(b, (img) => {
    width = img.width;
    height = img.height;
  });
  if (width < 1 || height < 1) throw Error("WEBP_DECODE_FAILED");
  return {
    sha256: await sha256(b),
    bytes: b.length,
    mime,
    width,
    height,
    decode: "PASS",
    signature: "RIFF/WEBP",
  };
}
export async function sha256(b: Uint8Array) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(b).buffer),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
