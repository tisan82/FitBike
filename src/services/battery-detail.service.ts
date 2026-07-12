import type { BatteryProductDetail } from "@/features/battery-detail/types/battery-detail.types";
import { findActiveBatteryProductById } from "@/repositories/battery-detail.repository";

export class BatteryProductNotFoundError extends Error {
  constructor() {
    super("배터리 상품 정보를 찾을 수 없습니다.");
    this.name = "BatteryProductNotFoundError";
  }
}

export async function getBatteryProductDetail(
  batteryProductId: number,
): Promise<BatteryProductDetail> {
  const product = await findActiveBatteryProductById(batteryProductId);
  if (!product) throw new BatteryProductNotFoundError();

  return {
    batteryProductId: product.battery_product_id,
    batteryPartKey: product.battery_part_key,
    brandName: product.brand_name,
    specCode: product.spec_code,
    voltage: product.voltage,
    lengthMm: product.length_mm,
    widthMm: product.width_mm,
    heightMm: product.height_mm,
    weightKg: product.weight_kg,
    capacityAh: product.capacity_ah,
    wattHour: product.watt_hour,
    internalResistanceMohm: product.internal_resistance_mohm,
    continuousDischargeCca: product.continuous_discharge_cca,
    maxDischargeCca: product.max_discharge_cca,
    batteryType: product.battery_type,
    terminalPolarity: product.terminal_polarity,
    terminalType: product.terminal_type,
    productImageUrl: product.product_image_url,
    productUrl: product.product_url,
    sellerName: product.seller_name,
    price: product.price,
  };
}
