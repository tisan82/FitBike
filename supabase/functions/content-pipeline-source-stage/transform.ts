import {
  CompositeOperator,
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
  MagickImageInfo,
} from "npm:@imagemagick/magick-wasm@0.0.42";
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { parseHTML } from "npm:linkedom@0.18.12";
import pdfjsImport from "npm:pdfjs-dist@3.11.174/legacy/build/pdf.js";
const wasm = await Deno.readFile(
  new URL(
    "magick.wasm",
    import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42"),
  ),
);
await initializeImageMagick(wasm);
let svgReady = false;
async function renderSvg(svg: string) {
  if (!svgReady) {
    await initWasm(
      await Deno.readFile(
        new URL(
          "index_bg.wasm",
          import.meta.resolve("npm:@resvg/resvg-wasm@2.6.2"),
        ),
      ),
    );
    svgReady = true;
  }
  return new Resvg(svg).render().asPng();
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
    }
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
      ) => { getSVG(a: unknown, b: unknown): Promise<{ outerHTML?: string }> };
    };
    const pdfModule = pdfjsImport as unknown as Pdf & { default?: Pdf },
      pdfjs = pdfModule.default ?? pdfModule;
    const pdf = await pdfjs.getDocument({ data: bytes, disableWorker: true })
      .promise;
    if (pageNo! > pdf.numPages) throw Error("PDF_PAGE_OUT_OF_RANGE");
    const page = await pdf.getPage(pageNo!),
      v = page.getViewport({ scale: 1.5 });
    if (v.width * v.height > 12000000) throw Error("PDF_PAGE_TOO_LARGE");
    const svg = await new pdfjs.SVGGraphics(page.commonObjs, page.objs, true)
      .getSVG(await page.getOperatorList(), v);
    let text = (svg.outerHTML || String(svg)).replaceAll("svg:", "");
    if (!text.includes("xmlns=")) {
      text = text.replace(
        "<svg ",
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ',
      );
    }
    input = await renderSvg(text);
  }
  const header = MagickImageInfo.create(input);
  const expectedFormat = mime === "image/jpeg"
    ? MagickFormat.Jpeg
    : mime === "image/webp"
    ? MagickFormat.WebP
    : MagickFormat.Png;
  if (
    header.format !== expectedFormat || header.width < 1 || header.height < 1 ||
    header.width * header.height > 24000000
  ) throw Error("SOURCE_DIMENSIONS_OR_FORMAT_INVALID");
  let width = 0, height = 0;
  let png = ImageMagick.read(input, (img) => {
    if (img.width < 1 || img.height < 1 || img.width * img.height > 24000000) {
      throw Error("SOURCE_DIMENSIONS_INVALID");
    }
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
      (t.maxWidth ?? 1200) / img.width,
      2000 / img.height,
    );
    if (ratio < 1) {
      img.resize(
        Math.max(1, Math.round(img.width * ratio)),
        Math.max(1, Math.round(img.height * ratio)),
      );
    }
    width = img.width;
    height = img.height;
    return img.write(MagickFormat.Png, (d) => Uint8Array.from(d));
  });
  if (t.annotations?.length) {
    const scale = Math.min(width, height),
      stroke = Math.max(4, Math.round(width * 0.009));
    const shapes = t.annotations.map((a) =>
      a.type === "circle"
        ? `<circle cx="${a.x * width}" cy="${a.y * height}" r="${
          a.radius * scale
        }"/>`
        : `<path d="M ${a.x1 * width} ${a.y1 * height} L ${a.x2 * width} ${
          a.y2 * height
        }" marker-end="url(#head)"/>`
    ).join("");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><marker id="head" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 Z" fill="#facc15"/></marker></defs><g fill="none" stroke="#111827" stroke-width="${
        stroke + 4
      }">${shapes}</g><g fill="none" stroke="#facc15" stroke-width="${stroke}">${shapes}</g></svg>`;
    const overlay = await renderSvg(svg);
    png = ImageMagick.read(png, (img) =>
      ImageMagick.read(overlay, (layer) => {
        img.composite(layer, CompositeOperator.Over);
        return img.write(MagickFormat.Png, (d) => Uint8Array.from(d));
      }));
  }
  const webp = ImageMagick.read(png, (img) => {
    img.quality = 84;
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
