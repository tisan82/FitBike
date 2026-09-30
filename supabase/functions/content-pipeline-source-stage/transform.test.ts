import {
  inspectWebp,
  transformSource,
  validateTransform,
} from "./transform.ts";
import {
  ImageMagick,
  MagickColor,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.42";
function assert(v: unknown, m: string) {
  if (!v) throw Error(m);
}
const source = ImageMagick.read(
  new MagickColor("#334155"),
  1000,
  600,
  (img) => img.write(MagickFormat.Png, (b) => Uint8Array.from(b)),
);
Deno.test("crop+resize returns decoded final dimensions and real SHA", async () => {
  const f = await transformSource(
    source,
    "image/png",
    validateTransform({
      crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      maxWidth: 390,
    }),
  );
  const p = await inspectWebp(f.webp, "image/webp");
  assert(p.width === 390 && p.height === 234, "crop/resize dimensions wrong");
  assert(
    /^[a-f0-9]{64}$/.test(p.sha256) && p.decode === "PASS",
    "identity/decode failed",
  );
});
Deno.test("circle+arrow change real encoded image bytes", async () => {
  const a = await transformSource(
    source,
    "image/png",
    validateTransform({ maxWidth: 390 }),
  );
  const b = await transformSource(
    source,
    "image/png",
    validateTransform({
      maxWidth: 390,
      annotations: [{ type: "circle", x: 0.5, y: 0.5, radius: 0.2 }, {
        type: "arrow",
        x1: 0.1,
        y1: 0.1,
        x2: 0.4,
        y2: 0.4,
      }],
    }),
  );
  assert(
    (await inspectWebp(a.webp, "image/webp")).sha256 !==
      (await inspectWebp(b.webp, "image/webp")).sha256,
    "annotation was not encoded",
  );
});
Deno.test("invalid crop, unsupported label and non-WebP input are rejected", async () => {
  for (
    const t of [{ crop: { x: 0.9, y: 0, width: 0.2, height: 1 } }, {
      annotations: [{ type: "label", text: "foo" }],
    }, { maxWidth: 10 }]
  ) {
    let rejected = false;
    try {
      validateTransform(t);
    } catch {
      rejected = true;
    }
    assert(rejected, "invalid transform accepted");
  }
  let rejected = false;
  try {
    await inspectWebp(source, "image/webp");
  } catch {
    rejected = true;
  }
  assert(rejected, "PNG accepted as WebP");
});
