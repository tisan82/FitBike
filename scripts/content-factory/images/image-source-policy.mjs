const brandByPart = { TIRE: "MAXXIS", BATTERY: "POWEROAD" };

function selectImageSource({ partType, role, imageRole, brandAssetAvailable, brandAssetSuitable = true, sourceAsset = null, fallbackReason = null }) {
  const brand = brandByPart[partType] ?? null;
  const brandRequired = brand && (role === "thumbnail" || imageRole === "PRODUCT_REPRESENTATION");
  if (imageRole === "EDUCATIONAL_DIAGRAM") {
    return { status: "PASS", sourceType: "GENERATED_EDUCATIONAL", brand: null, sourceAsset: null, brandAssetChecked: Boolean(brand), brandAssetResult: brandAssetAvailable ? "NOT_SUITABLE" : "UNAVAILABLE", fallbackReason: fallbackReason ?? "Educational explanation requires a purpose-built visual." };
  }
  if (brandAssetAvailable && brandAssetSuitable) {
    return { status: "PASS", sourceType: "APPROVED_BRAND_ASSET", brand, sourceAsset, brandAssetChecked: true, brandAssetResult: "SUITABLE", fallbackReason: null };
  }
  if (brandRequired && imageRole === "PRODUCT_REPRESENTATION") {
    return { status: "FAIL", sourceType: "NONE", brand, sourceAsset: null, brandAssetChecked: true, brandAssetResult: brandAssetAvailable ? "NOT_SUITABLE" : "UNAVAILABLE", fallbackReason: fallbackReason ?? "Approved brand product asset is required." };
  }
  if (brandRequired && !fallbackReason) {
    return { status: "FAIL", sourceType: "NONE", brand, sourceAsset: null, brandAssetChecked: true, brandAssetResult: brandAssetAvailable ? "NOT_SUITABLE" : "UNAVAILABLE", fallbackReason: "brand_asset_not_suitable_reason is required." };
  }
  return { status: "PASS", sourceType: "GENERATED_GENERIC", brand: null, sourceAsset: null, brandAssetChecked: Boolean(brand), brandAssetResult: brandAssetAvailable ? "NOT_SUITABLE" : "UNAVAILABLE", fallbackReason: fallbackReason ?? "No approved brand asset exists for this non-product visual." };
}

export { selectImageSource };
