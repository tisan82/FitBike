import {
  inspectWebp,
  pdfFontFamily,
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

Deno.test("embedded PDF torque text survives WebP and 390px rendering", async () => {
  const encoded = await Deno.readTextFile(
    new URL("./fixtures/torque-font.pdf.base64", import.meta.url),
  );
  const bytes = Uint8Array.from(atob(encoded.trim()), (c) => c.charCodeAt(0));
  const result = await transformSource(bytes, "application/pdf", {
    maxWidth: 390,
  }, 1);
  const proof = await inspectWebp(result.webp, "image/webp");
  assert(proof.width >= 389 && proof.width <= 390, "mobile width wrong");
  // The fixture contains only text on white: blank pixels reproduced the old bug.
  ImageMagick.read(result.webp, (img) => {
    const rgb = img.getPixels((p) =>
      p.toByteArray(0, 0, img.width, img.height, "RGB")
    );
    assert(rgb, "pixels missing");
    for (const [top, bottom] of [[40, 62], [83, 105]]) {
      let dark = 0;
      for (let y = top; y < bottom; y++) {
        for (let x = 10; x < 365; x++) {
          const i = (y * img.width + x) * 3;
          if (rgb![i] < 100 && rgb![i + 1] < 100 && rgb![i + 2] < 100) dark++;
        }
      }
      assert(dark > 300, "PDF_TEXT_RENDER_MISSING: torque row disappeared");
    }
  });
});

Deno.test("missing or invalid PDF fonts fail instead of producing blank text", async () => {
  let invalid = false;
  try {
    pdfFontFamily(new Uint8Array(12));
  } catch {
    invalid = true;
  }
  assert(invalid, "invalid font accepted");
  const encoded = await Deno.readTextFile(
    new URL("./fixtures/torque-font.pdf.base64", import.meta.url),
  );
  const bytes = Uint8Array.from(atob(encoded.trim()), (c) => c.charCodeAt(0));
  // Remove the embedded-font reference without moving any PDF/xref offsets.
  const marker = new TextEncoder().encode("/FontFile2");
  let replaced = false;
  for (let i = 0; i <= bytes.length - marker.length; i++) {
    if (marker.every((v, j) => bytes[i + j] === v)) {
      bytes.set(new TextEncoder().encode("/UnusedKey"), i);
      replaced = true;
    }
  }
  assert(replaced, "fixture must have an embedded font");
  let failure = "";
  try {
    await transformSource(bytes, "application/pdf", { maxWidth: 390 }, 1);
  } catch (e) {
    failure = String(e);
  }
  assert(
    failure.includes("PDF_FONT_UNAVAILABLE"),
    "missing font silently rendered: " + failure,
  );
});

Deno.test("Korean labels render distinct glyphs at 390px and keep outside pixels", async () => {
  const outputs: Uint8Array[] = [];
  for (const text of ["배터리", "엔진오일"]) {
    const r = await transformSource(source, "image/png", validateTransform({maxWidth:390,
      annotations:[{type:"label",text,x:.05,y:.1},{type:"arrow",x1:.3,y1:.3,x2:.5,y2:.6}]}));
    const proof = await inspectWebp(r.webp,"image/webp");
    assert(proof.width===390 && proof.height===234,"mobile geometry");
    ImageMagick.read(r.webp,img=>{
      const rgb=img.getPixels(p=>p.toByteArray(0,0,img.width,img.height,"RGB"))!;
      let bright=0;
      for(let y=24;y<52;y++) for(let x=20;x<130;x++) {
        const i=(y*390+x)*3; if(rgb[i]>200 && rgb[i+1]>200 && rgb[i+2]>200) bright++;
      }
      assert(bright>40,"Korean label has no visible glyphs");
      const i=(220*390+380)*3;
      assert(Math.abs(rgb[i]-51)<12 && Math.abs(rgb[i+1]-65)<12,"overlay replaced source background");
    });
    outputs.push(r.webp);
    if(text==="배터리") await Deno.writeFile("/tmp/korean-label-mobile.webp",r.webp);
  }
  assert((await inspectWebp(outputs[0],"image/webp")).sha256!==(await inspectWebp(outputs[1],"image/webp")).sha256,"different labels rendered identically");
});
Deno.test("label validation rejects empty/control/unsupported glyphs and sizes",()=>{
  for(const extra of [{text:""},{text:"배터리\n"},{text:"⚠"},{text:"가".repeat(17)},{fontSize:13},{fontSize:25},{x:2},{fill:"url(http://evil)"}]) {
    let rejected=false;try{validateTransform({annotations:[{type:"label",text:"배터리",x:.1,y:.1,...extra}]});}catch{rejected=true;}
    assert(rejected,"unsafe label accepted");
  }
});
