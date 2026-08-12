import {
  findActiveBrands,
  findActiveModelsByBrand,
  findActiveYearsByModel,
} from "@/repositories/bike-selector.repository";
import type {
  BrandOption,
  ModelOption,
  YearOption,
} from "@/features/bike-selector/types/bike-selector.types";

export async function getBrandOptions(): Promise<BrandOption[]> {
  const rows = await findActiveBrands();
  return rows.map((row) => ({
    brandId: row.brand_id,
    brandKey: row.brand_key,
    brandNameEn: row.brand_en,
    brandNameKo: row.brand_ko,
    logoImageUrl: row.logo_image_url,
  }));
}

export async function getModelOptionsByBrand(
  brandId: number,
): Promise<ModelOption[]> {
  const rows = await findActiveModelsByBrand(brandId);
  return rows.map((row) => ({
    bikeModelId: row.bike_model_id,
    modelKey: row.model_key,
    modelNameEn: row.model_name_en,
    modelNameKo: row.model_name_ko,
    category: row.default_category,
    engineCc: row.engine_cc,
    modelImageUrl: row.model_image_url,
  }));
}

export async function getYearOptionsByModel(
  bikeModelId: number,
): Promise<YearOption[]> {
  const rows = await findActiveYearsByModel(bikeModelId);
  return rows.map((row) => ({
    bikeModelYearId: row.bike_model_year_id,
    yearRangeLabel: row.year_range_label,
    startYear: row.start_year,
    endYear: row.end_year,
    generationName: row.generation_name,
    trimName: row.trim_name,
    variantName: row.variant_name,
  }));
}
