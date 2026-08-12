import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * Converts a Supabase Storage object path to a public URL
 *
 * @param storagePath - The object path in Supabase Storage (e.g., "manufacturers/aprilia/logo.jpg")
 * @param bucketName - The bucket name (default: "bike-assets")
 * @returns The public URL, or null if storagePath is null/empty
 *
 * @example
 * // Input: "manufacturers/aprilia/logo.jpg"
 * // Output: "https://[PROJECT_ID].supabase.co/storage/v1/object/public/bike-assets/manufacturers/aprilia/logo.jpg"
 */
export function getStoragePublicUrl(
  storagePath: string | null | undefined,
  bucketName: string = "bike-assets",
): string | null {
  const normalizedPath = storagePath?.trim();
  if (!normalizedPath) {
    return null;
  }

  if (
    normalizedPath.startsWith("http://") ||
    normalizedPath.startsWith("https://")
  ) {
    return normalizedPath;
  }

  const objectPath = normalizedPath.replace(/^\/+/, "");
  const supabase = createBrowserSupabaseClient();
  const { data } = supabase.storage.from(bucketName).getPublicUrl(objectPath);
  return data.publicUrl;
}
