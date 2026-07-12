import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";
import {
  findBrandDetail,
  findModelDetail,
  findModelYearDetail,
} from "@/repositories/model-detail.repository";

export class ModelDetailNotFoundError extends Error {
  constructor() {
    super("바이크 상세 정보를 찾을 수 없습니다.");
    this.name = "ModelDetailNotFoundError";
  }
}

export async function getModelDetail(
  bikeModelYearId: number,
): Promise<ModelDetailData> {
  const modelYear = await findModelYearDetail(bikeModelYearId);
  if (!modelYear) throw new ModelDetailNotFoundError();

  const model = await findModelDetail(modelYear.bike_model_id);
  if (!model) throw new ModelDetailNotFoundError();

  const brand = await findBrandDetail(model.brand_id);
  if (!brand) throw new ModelDetailNotFoundError();

  return {
    bikeModelYearId: modelYear.bike_model_year_id,
    bikeModelId: model.bike_model_id,
    brandId: brand.brand_id,
    brandNameEn: brand.brand_en,
    brandNameKo: brand.brand_ko,
    brandSummary: brand.brand_summary,
    modelKey: model.model_key,
    modelNameEn: model.model_name_en,
    modelNameKo: model.model_name_ko,
    modelSummary: model.model_summary,
    category: modelYear.category_override ?? model.default_category,
    engineCc: modelYear.engine_cc_override ?? model.engine_cc,
    generationKey: modelYear.generation_key,
    generationName: modelYear.generation_name,
    frameCode: modelYear.frame_code,
    trimName: modelYear.trim_name,
    variantName: modelYear.variant_name,
    marketCode: modelYear.market_code,
    yearRangeLabel: modelYear.year_range_label,
    startYear: modelYear.start_year,
    endYear: modelYear.end_year,
    imageUrl: modelYear.generation_image_url ?? model.model_image_url,
    frontTire: {
      fullSize: modelYear.front_tire_full_size,
      width: modelYear.front_tire_width,
      ratio: modelYear.front_tire_ratio,
      diameter: modelYear.front_tire_diameter,
      loadIndex: modelYear.front_tire_load_index,
      speedIndex: modelYear.front_tire_speed_index,
      tubeType: modelYear.front_tire_tube_type,
    },
    rearTire: {
      fullSize: modelYear.rear_tire_full_size,
      width: modelYear.rear_tire_width,
      ratio: modelYear.rear_tire_ratio,
      diameter: modelYear.rear_tire_diameter,
      loadIndex: modelYear.rear_tire_load_index,
      speedIndex: modelYear.rear_tire_speed_index,
      tubeType: modelYear.rear_tire_tube_type,
    },
    batteryStandardCode: modelYear.battery_standard_code,
    batteryVoltage: modelYear.battery_voltage,
    frontBrakeSpec: modelYear.front_brake_spec,
    frontBrakeCaliperType: modelYear.front_brake_caliper_type,
    rearBrakeSpec: modelYear.rear_brake_spec,
    rearBrakeCaliperType: modelYear.rear_brake_caliper_type,
    modelFeatures: modelYear.model_features,
    majorChanges: modelYear.major_changes,
  };
}
