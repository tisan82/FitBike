import type { ConnectedProduct, ModelDetailData, ModelDetailProductsData } from "@/features/model-detail/types/model-detail.types";
import {
  findBatteryMappings,
  findBatteryProducts,
  findBrandDetail,
  findBrakeMappings,
  findBrakeProducts,
  findModelDetail,
  findModelYearOptions,
  findModelYearDetail,
  findPrimaryModelYearImage,
  findTireMappings,
  findTireProducts,
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

  const [model, yearOptions, primaryImage] = await Promise.all([
    findModelDetail(modelYear.bike_model_id),
    findModelYearOptions(modelYear.bike_model_id),
    findPrimaryModelYearImage(bikeModelYearId),
  ]);
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
    imageUrl: primaryImage ?? modelYear.generation_image_url,
    yearOptions: yearOptions.map((year) => ({
      bikeModelYearId: year.bike_model_year_id,
      yearRangeLabel: year.year_range_label,
      startYear: year.start_year,
      endYear: year.end_year,
    })),
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

function joinParts(parts: Array<string | number | null | undefined>) {
  const value = parts.filter((part) => part !== null && part !== undefined && part !== "").join(" · ");
  return value || null;
}

function connect<T extends { id: number; position_type?: "FRONT" | "REAR"; productId: number }>(mappings: T[], products: Map<number, ConnectedProduct>) {
  return mappings.flatMap((mapping) => {
    const product = products.get(mapping.productId);
    return product ? [{ ...product, position: mapping.position_type }] : [];
  });
}

export async function getModelDetailProducts(bikeModelYearId: number): Promise<ModelDetailProductsData> {
  const modelYear = await findModelYearDetail(bikeModelYearId);
  if (!modelYear) throw new ModelDetailNotFoundError();
  const [tireMappings, batteryMappings, brakeMappings] = await Promise.all([
    findTireMappings(bikeModelYearId),
    modelYear.battery_standard_code ? findBatteryMappings(modelYear.battery_standard_code) : Promise.resolve([]),
    findBrakeMappings(bikeModelYearId),
  ]);
  const [tires, batteries, brakes] = await Promise.all([
    findTireProducts(tireMappings.flatMap((item) => item.tire_product_id ?? [])),
    findBatteryProducts(batteryMappings.flatMap((item) => item.battery_product_id ?? [])),
    findBrakeProducts(brakeMappings.flatMap((item) => item.brake_product_id ?? [])),
  ]);
  const tireMap = new Map(tires.map((p) => [p.tire_product_id as number, { id: p.tire_product_id as number, brandName: p.brand_name, productName: p.product_name as string, secondaryInformation: joinParts([p.tire_size_full, p.load_index, p.speed_index, p.tube_type]), detailHref: `/tire-detail/${p.tire_product_id}` }]));
  const batteryMap = new Map(batteries.map((p) => [p.battery_product_id as number, { id: p.battery_product_id as number, brandName: p.brand_name, productName: p.spec_code as string, secondaryInformation: joinParts([p.voltage, p.capacity_ah === null || p.capacity_ah === undefined ? null : `${p.capacity_ah}Ah`, p.battery_type]), detailHref: `/battery-detail/${p.battery_product_id}` }]));
  const brakeMap = new Map(brakes.map((p) => [p.brake_product_id as number, { id: p.brake_product_id as number, brandName: p.brand_name, productName: p.product_name as string, secondaryInformation: joinParts([p.brake_type, p.compatible_code]), detailHref: null }]));
  const connectedTires = connect(tireMappings.map((m) => ({ id: m.id, position_type: m.position_type, productId: m.tire_product_id as number })), tireMap);
  const connectedBrakes = connect(brakeMappings.map((m) => ({ id: m.id, position_type: m.position_type, productId: m.brake_product_id as number })), brakeMap);
  const connectedBatteries = connect(batteryMappings.map((m) => ({ id: m.id, productId: m.battery_product_id as number })), batteryMap);
  return {
    tire: { front: connectedTires.filter((p) => p.position === "FRONT"), rear: connectedTires.filter((p) => p.position === "REAR") },
    battery: connectedBatteries,
    brake: { front: connectedBrakes.filter((p) => p.position === "FRONT"), rear: connectedBrakes.filter((p) => p.position === "REAR") },
  };
}
