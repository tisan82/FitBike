import {
  ImageMagick,
  MagickColors,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.42";
import { inspectPixels } from "./inspection.ts";
async function fixture(width: number, height: number) {
  const bytes = ImageMagick.read(
    MagickColors.Red,
    width,
    height,
    (img) => img.write(MagickFormat.WebP, (d) => Uint8Array.from(d)),
  );
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  return { bytes, expected: { sha256, bytes: bytes.length, width, height } };
}
async function rejects(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof Error && e.message.includes(code)) return;
    throw e;
  }
  throw Error("EXPECTED_" + code);
}
Deno.test("exact WebP identity, actual decode and derived 390px preview", async () => {
  const f = await fixture(780, 587),
    p = await inspectPixels(f.bytes, f.expected);
  if (p.metadata.decode !== "PASS" || p.metadata.sha256 !== f.expected.sha256) {
    throw Error("DECODE_FAILED");
  }
  ImageMagick.read(p.mobile, (img) => {
    if (img.width !== 390 || img.height !== 294) {
      throw Error("MOBILE_DIMENSIONS");
    }
  });
  await rejects(
    () => inspectPixels(f.bytes, { ...f.expected, sha256: "0".repeat(64) }),
    "IDENTITY_MISMATCH",
  );
  await rejects(
    () => inspectPixels(f.bytes, { ...f.expected, width: 781 }),
    "DIMENSIONS_MISMATCH",
  );
  await rejects(
    () => inspectPixels(new Uint8Array(12), f.expected),
    "INVALID_WEBP",
  );
});
Deno.test("narrow crop cannot create oversized mobile preview", async () => {
  const f = await fixture(1, 2000);
  await rejects(
    () => inspectPixels(f.bytes, f.expected),
    "ASPECT_RATIO_UNSUPPORTED",
  );
});
