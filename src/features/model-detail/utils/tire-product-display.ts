const TIRE_PATTERN = /^[A-Z0-9]+(?:[-/.][A-Z0-9]+)*$/i;

export function getTireProductDisplayName(
  brandName: string,
  productName: string,
) {
  const normalizedBrand = brandName.trim().toLocaleLowerCase();
  const normalizedProduct = productName.trim();
  const [firstToken, pattern] = normalizedProduct.split(/\s+/, 2);

  if (
    firstToken?.toLocaleLowerCase() === normalizedBrand &&
    pattern &&
    TIRE_PATTERN.test(pattern)
  ) {
    return pattern;
  }

  return normalizedProduct;
}
