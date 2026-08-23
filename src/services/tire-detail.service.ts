import type {
  TireModelDetailData,
  TireModelFeature,
  TireModelListItem,
  TireProductDetail,
  TireProductFitment,
} from "@/features/tire-detail/types/tire-detail.types";
import {
  findActiveFitmentBrands,
  findActiveFitmentModels,
  findActiveFitmentModelYears,
  findActiveTireFitmentMappings,
  findActiveTireModelById,
  findActiveTireModelByKey,
  findActiveTireModelsByBrandName,
  findActiveTireProductById,
  findActiveTireProductsByModelId,
} from "@/repositories/tire-detail.repository";

export class TireProductNotFoundError extends Error {
  constructor() {
    super("타이어 상품 정보를 찾을 수 없습니다.");
    this.name = "TireProductNotFoundError";
  }
}

export class TireModelNotFoundError extends Error {
  constructor() {
    super("타이어 모델 정보를 찾을 수 없습니다.");
    this.name = "TireModelNotFoundError";
  }
}

export async function getTireProductDetail(
  tireProductId: number,
): Promise<TireProductDetail> {
  const product = await findActiveTireProductById(tireProductId);
  if (!product) throw new TireProductNotFoundError();

  const [model, fitments] = await Promise.all([
    product.tire_model_id
      ? findActiveTireModelById(product.tire_model_id)
      : Promise.resolve(null),
    getTireProductFitments(tireProductId),
  ]);
  const otherProducts = model
    ? (await findActiveTireProductsByModelId(model.tire_model_id)).filter(
        (candidate) => candidate.tire_product_id !== tireProductId,
      )
    : [];

  return {
    tireProductId: product.tire_product_id,
    tireProductKey: product.tire_product_key,
    brandName: product.brand_name,
    productName: product.product_name,
    tireSizeFull: product.tire_size_full,
    width: product.width,
    ratio: product.ratio,
    diameter: product.diameter,
    loadIndex: product.load_index,
    speedIndex: product.speed_index,
    tubeType: product.tube_type,
    positionType: product.position_type,
    productImageUrl: product.product_image_url,
    productUrl: product.product_url,
    sellerName: product.seller_name,
    price: product.price,
    fitmentCount: fitments.length,
    model: model
      ? {
          tireModelId: model.tire_model_id,
          tireModelKey: model.tire_model_key,
          displayName: model.display_name?.trim() || model.model_name,
          summary: model.summary,
          mainImageUrl: model.main_image_url,
        }
      : null,
    otherSkus: otherProducts.map((candidate) => ({
      tireProductId: candidate.tire_product_id,
      tireProductKey: candidate.tire_product_key,
      tireSizeFull: candidate.tire_size_full,
      width: candidate.width,
      ratio: candidate.ratio,
      diameter: candidate.diameter,
      loadIndex: candidate.load_index,
      speedIndex: candidate.speed_index,
      tubeType: candidate.tube_type,
      positionType: candidate.position_type,
      productImageUrl: candidate.product_image_url,
      productUrl: candidate.product_url,
      price: candidate.price,
      fitmentCount: 0,
    })),
  };
}

function createFeature(
  index: number,
  title: string | null,
  description: string | null,
): TireModelFeature | null {
  if (!title?.trim()) return null;
  return {
    number: String(index).padStart(2, "0"),
    title: title.trim(),
    description: description?.trim() || null,
  };
}

export async function getTireModelDetail(
  tireModelKey: string,
): Promise<TireModelDetailData> {
  const model = await findActiveTireModelByKey(tireModelKey);
  if (!model) throw new TireModelNotFoundError();

  const products = await findActiveTireProductsByModelId(model.tire_model_id);
  const features = [
    createFeature(1, model.feature_1_title, model.feature_1_description),
    createFeature(2, model.feature_2_title, model.feature_2_description),
    createFeature(3, model.feature_3_title, model.feature_3_description),
  ].filter((feature): feature is TireModelFeature => feature !== null);

  return {
    tireModelId: model.tire_model_id,
    tireModelKey: model.tire_model_key,
    brandName: model.brand_name,
    modelName: model.model_name,
    displayName: model.display_name?.trim() || model.model_name,
    categoryType: model.category_type,
    ridingType: model.riding_type,
    summary: model.summary,
    description: model.description,
    mainImageUrl: model.main_image_url,
    subImageUrl1: model.sub_image_url_1,
    subImageUrl2: model.sub_image_url_2,
    features,
    skus: products.map((product) => ({
      tireProductId: product.tire_product_id,
      tireProductKey: product.tire_product_key,
      tireSizeFull: product.tire_size_full,
      width: product.width,
      ratio: product.ratio,
      diameter: product.diameter,
      loadIndex: product.load_index,
      speedIndex: product.speed_index,
      tubeType: product.tube_type,
      positionType: product.position_type,
      productImageUrl: product.product_image_url,
      productUrl: product.product_url,
      price: product.price,
      fitmentCount: 0,
    })),
  };
}

export async function getActiveTireModelsByBrandName(
  brandName: string,
): Promise<TireModelListItem[]> {
  const models = await findActiveTireModelsByBrandName(brandName);
  return models.map((model) => ({
    tireModelKey: model.tire_model_key,
    modelName: model.model_name,
    displayName: model.display_name?.trim() || model.model_name,
    summary: model.summary,
    categoryType: model.category_type,
    ridingType: model.riding_type,
    mainImageUrl: model.main_image_url,
  }));
}

export async function getTireProductFitments(
  tireProductId: number,
): Promise<TireProductFitment[]> {
  const product = await findActiveTireProductById(tireProductId);
  if (!product) throw new TireProductNotFoundError();

  const mappings = await findActiveTireFitmentMappings([tireProductId]);
  const modelYears = await findActiveFitmentModelYears(
    mappings.map((mapping) => mapping.bike_model_year_id),
  );
  const models = await findActiveFitmentModels(
    [...new Set(modelYears.map((year) => year.bike_model_id))],
  );
  const brands = await findActiveFitmentBrands(
    [...new Set(models.map((model) => model.brand_id))],
  );

  const yearMap = new Map(modelYears.map((year) => [year.bike_model_year_id, year]));
  const modelMap = new Map(models.map((model) => [model.bike_model_id, model]));
  const brandMap = new Map(brands.map((brand) => [brand.brand_id, brand]));

  const fitments = mappings.flatMap((mapping) => {
    const year = yearMap.get(mapping.bike_model_year_id);
    const model = year ? modelMap.get(year.bike_model_id) : null;
    const brand = model ? brandMap.get(model.brand_id) : null;
    if (!year || !model || !brand) return [];
    return [{
      bikeModelYearId: year.bike_model_year_id,
      brandName: brand.brand_ko ?? brand.brand_en,
      modelName: model.model_name_ko ?? model.model_name_en,
      yearRangeLabel: year.year_range_label,
      position: mapping.position_type,
    }];
  });

  return [
    ...new Map(
      fitments.map((fitment) => [
        `${fitment.bikeModelYearId}-${fitment.position}`,
        fitment,
      ]),
    ).values(),
  ];
}
