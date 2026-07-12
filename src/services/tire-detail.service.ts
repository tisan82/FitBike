import type { TireProductDetail } from "@/features/tire-detail/types/tire-detail.types";
import { findActiveTireProductById } from "@/repositories/tire-detail.repository";

export class TireProductNotFoundError extends Error {
  constructor() {
    super("타이어 상품 정보를 찾을 수 없습니다.");
    this.name = "TireProductNotFoundError";
  }
}

export async function getTireProductDetail(
  tireProductId: number,
): Promise<TireProductDetail> {
  const product = await findActiveTireProductById(tireProductId);
  if (!product) throw new TireProductNotFoundError();

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
  };
}
