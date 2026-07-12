import type {
  FitmentResultData,
  SelectedBikeSummary,
  TireFitmentProduct,
} from "@/features/fitment-result/types/fitment-result.types";
import {
  findActiveBikeModel,
  findActiveBikeModelYear,
  findActiveBrand,
  findActiveTireFitments,
  findActiveTireProducts,
} from "@/repositories/fitment-result.repository";

export class FitmentResultNotFoundError extends Error {
  constructor() {
    super("선택한 바이크 정보를 찾을 수 없습니다.");
    this.name = "FitmentResultNotFoundError";
  }
}

async function getSelectedBikeSummary(
  bikeModelYearId: number,
): Promise<SelectedBikeSummary> {
  const modelYear = await findActiveBikeModelYear(bikeModelYearId);
  if (!modelYear) throw new FitmentResultNotFoundError();

  const model = await findActiveBikeModel(modelYear.bike_model_id);
  if (!model) throw new FitmentResultNotFoundError();

  const brand = await findActiveBrand(model.brand_id);
  if (!brand) throw new FitmentResultNotFoundError();

  return {
    bikeModelYearId: modelYear.bike_model_year_id,
    bikeModelId: model.bike_model_id,
    brandId: brand.brand_id,
    brandNameEn: brand.brand_en,
    brandNameKo: brand.brand_ko,
    modelKey: model.model_key,
    modelNameEn: model.model_name_en,
    modelNameKo: model.model_name_ko,
    category: modelYear.category_override ?? model.default_category,
    engineCc: modelYear.engine_cc_override ?? model.engine_cc,
    generationName: modelYear.generation_name,
    yearRangeLabel: modelYear.year_range_label,
    startYear: modelYear.start_year,
    endYear: modelYear.end_year,
    imageUrl: modelYear.generation_image_url ?? model.model_image_url,
    frontTireFullSize: modelYear.front_tire_full_size,
    rearTireFullSize: modelYear.rear_tire_full_size,
  };
}

async function getTireFitmentProducts(
  bikeModelYearId: number,
): Promise<TireFitmentProduct[]> {
  const fitments = await findActiveTireFitments(bikeModelYearId);
  const products = await findActiveTireProducts(
    Array.from(new Set(fitments.map((item) => item.tire_product_id))),
  );
  const productById = new Map(products.map((item) => [item.tire_product_id, item]));

  return fitments.flatMap((fitment) => {
    const product = productById.get(fitment.tire_product_id);
    if (!product) return [];

    return [{
      fitmentId: fitment.id,
      tireProductId: product.tire_product_id,
      tireProductKey: product.tire_product_key,
      fitmentPositionType: fitment.position_type,
      productPositionType: product.position_type,
      matchType: fitment.match_type,
      displayOrder: fitment.display_order,
      brandName: product.brand_name,
      productName: product.product_name,
      tireSizeFull: product.tire_size_full,
      width: product.width,
      ratio: product.ratio,
      diameter: product.diameter,
      loadIndex: product.load_index,
      speedIndex: product.speed_index,
      tubeType: product.tube_type,
      productImageUrl: product.product_image_url,
      productUrl: product.product_url,
      sellerName: product.seller_name,
      price: product.price,
    } satisfies TireFitmentProduct];
  });
}

export async function getFitmentResult(
  bikeModelYearId: number,
): Promise<FitmentResultData> {
  const [selectedBike, tireProducts] = await Promise.all([
    getSelectedBikeSummary(bikeModelYearId),
    getTireFitmentProducts(bikeModelYearId),
  ]);

  return { selectedBike, tireProducts };
}
