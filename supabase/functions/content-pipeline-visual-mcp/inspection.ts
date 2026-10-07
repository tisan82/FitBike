import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
  MagickGeometry,
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
  let canonical = new Uint8Array();
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
    // PNG is a lossless display transport; canonical storage/SHA remain WebP.
    canonical = img.write(MagickFormat.Png, (d) => Uint8Array.from(d));
    img.resize(390, mobileHeight);
    return img.write(MagickFormat.Png, (d) => Uint8Array.from(d));
  });
  // Match the public Card/Hero CSS: aspect-video, object-cover, centered.
  // These are inspection derivatives; never write them into canonical Storage.
  const cropWidth = Math.min(width, height * 16 / 9);
  const cropHeight = Math.min(height, width * 9 / 16);
  const crop = { x: Math.floor((width - cropWidth) / 2), y: Math.floor((height - cropHeight) / 2),
    width: Math.max(1, Math.round(cropWidth)), height: Math.max(1, Math.round(cropHeight)) };
  const renderCrop = (targetWidth: number, targetHeight: number) => ImageMagick.read(bytes, img => {
    img.crop(new MagickGeometry(crop.x, crop.y, crop.width, crop.height));
    img.resetPage();
    const size = new MagickGeometry(targetWidth, targetHeight);
    size.ignoreAspectRatio = true;
    img.resize(size);
    return img.write(MagickFormat.Png, d => Uint8Array.from(d));
  });
  const cardCrop = renderCrop(390, 219);
  const heroCrop = renderCrop(768, 432);
  return {
    cardCrop, heroCrop, crop,
    metadata: {
      sha256,
      bytes: bytes.length,
      mime: "image/webp",
      width,
      height,
      decode: "PASS",
      signature: "RIFF/WEBP",
    },
    canonical,
    mobile,
  };
}
