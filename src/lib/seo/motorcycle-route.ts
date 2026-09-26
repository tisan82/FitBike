export function getPublicModelSlug(brandSlug: string, storedModelSlug: string) {
  const brandPrefix = `${brandSlug}-`;
  return storedModelSlug.startsWith(brandPrefix)
    ? storedModelSlug.slice(brandPrefix.length)
    : storedModelSlug;
}
