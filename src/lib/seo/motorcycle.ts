export function toSeoSlug(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function modelSeoPath(brandName: string, modelName: string) {
  return `/motorcycles/${toSeoSlug(brandName)}/${toSeoSlug(modelName)}`;
}
