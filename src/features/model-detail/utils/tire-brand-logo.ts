const TIRE_BRAND_LOGO_DIRECTORY = "/images/brands/tire";

const TIRE_BRAND_ASSET_ALIASES: Record<string, string> = {
  maxxis: "maxxis",
  "맥시스": "maxxis",
};

function normalizeBrandName(brandName: string) {
  return brandName
    .trim()
    .toLowerCase();
}

export function getTireBrandLogo(brandName: string): string | null {
  const normalizedName = normalizeBrandName(brandName);
  const assetName = (TIRE_BRAND_ASSET_ALIASES[normalizedName] ?? normalizedName)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return assetName ? `${TIRE_BRAND_LOGO_DIRECTORY}/${assetName}.png` : null;
}
