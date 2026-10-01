const brandByPart = { TIRE: "MAXXIS", BATTERY: "POWEROAD" };

function selectImageSource({ partType, role, imageRole, brandAssetAvailable, brandAssetLookupAvailable = false, brandAssetSuitable = true, sourceAsset = null, fallbackReason = null, webAsset = null }) {
  const brand = brandByPart[partType] ?? null;
  const brandRequired = brand && (role === "thumbnail" || imageRole === "PRODUCT_REPRESENTATION");
  if (webAsset) {
    const provenanceComplete = Boolean(webAsset.sourceUrl && webAsset.creator);
    if (!provenanceComplete) {
      return { status: "FAIL", sourceType: "NONE", brand: null, sourceAsset: webAsset.sourceUrl ?? null, fallbackReason: "Web real-world assets require a source URL and creator/source owner." };
    }
    return { status: "PASS", sourceType: "WEB_REAL_ASSET_EDIT", brand: null, sourceAsset: webAsset.sourceUrl, creator: webAsset.creator, editPlan: webAsset.editPlan, fallbackReason: null };
  }
  if (imageRole === "EDUCATIONAL_DIAGRAM") {
    return { status: "PASS", sourceType: "GENERATED_EDUCATIONAL", brand: null, sourceAsset: null, brandAssetChecked: Boolean(brand), brandAssetResult: brandAssetAvailable ? "NOT_SUITABLE" : "UNAVAILABLE", fallbackReason: fallbackReason ?? "Educational explanation requires a purpose-built visual." };
  }
  if ((brandAssetAvailable || brandAssetLookupAvailable) && brandAssetSuitable) {
    return { status: "PASS", sourceType: "APPROVED_BRAND_ASSET", brand, sourceAsset, brandAssetChecked: true, brandAssetResult: sourceAsset ? "SUITABLE" : "LOOKUP_PENDING", fallbackReason: null };
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
