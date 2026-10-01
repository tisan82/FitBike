import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from "npm:@imagemagick/magick-wasm@0.0.42";
const wasm = await Deno.readFile(
  new URL(
    "magick.wasm",
    import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.42"),
  ),
);
await initializeImageMagick(wasm);
export async function inspectPixels(
  bytes: Uint8Array,
  expected: { sha256: string; bytes: number; width: number; height: number },
) {
  if (
    bytes.length < 12 || bytes.length > 4194304 ||
    new TextDecoder().decode(bytes.subarray(0, 4)) !== "RIFF" ||
    new TextDecoder().decode(bytes.subarray(8, 12)) !== "WEBP"
  ) throw Error("INVALID_WEBP");
  const sha256 = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  if (sha256 !== expected.sha256 || bytes.length !== expected.bytes) {
    throw Error("STAGING_IDENTITY_MISMATCH");
  }
  let width = 0, height = 0;
  const mobile = ImageMagick.read(bytes, (img) => {
    width = img.width;
    height = img.height;
    if (
      img.format !== MagickFormat.WebP || width !== expected.width ||
      height !== expected.height || width < 1 || height < 1 ||
      width * height > 3200000
    ) throw Error("WEBP_DECODE_OR_DIMENSIONS_MISMATCH");
    const mobileHeight = Math.max(1, Math.round(height * 390 / width));
    if (mobileHeight > 4000 || 390 * mobileHeight > 1560000) {
      throw Error("MOBILE_PREVIEW_ASPECT_RATIO_UNSUPPORTED");
    }
    img.resize(390, mobileHeight);
    return img.write(MagickFormat.Png, (d) => Uint8Array.from(d));
  });
  return {
    metadata: {
      sha256,
      bytes: bytes.length,
      mime: "image/webp",
      width,
      height,
      decode: "PASS",
      signature: "RIFF/WEBP",
    },
    mobile,
  };
}
