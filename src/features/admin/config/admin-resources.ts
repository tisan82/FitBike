import type { AdminResourceConfig } from "@/features/admin/types/admin.types";

/**
 * Operational admin allow-list.
 *
 * Do not add member tables, bike/model/year master tables, or fitment mapping tables here.
 * The operations console must stay separated from member and raw fitment data.
 */
export const ADMIN_RESOURCES: AdminResourceConfig[] = [
  {
    key: "tireProducts", label: "타이어 상품", table: "04_tire_product", primaryKey: "tire_product_id",
    searchColumns: ["tire_product_key", "brand_name", "product_name"],
    fields: [
      { key: "tire_product_id", label: "ID", type: "number", readonly: true },
      { key: "tire_product_key", label: "상품 키", type: "text", required: true },
      { key: "brand_name", label: "브랜드", type: "text", required: true },
      { key: "product_name", label: "상품명", type: "text", required: true },
      { key: "tire_size_full", label: "규격", type: "text" },
      { key: "position_type", label: "위치", type: "select", options: [
        { value: "FRONT", label: "FRONT — 앞 타이어" },
        { value: "REAR", label: "REAR — 뒤 타이어" },
        { value: "BOTH", label: "BOTH — 앞·뒤 사용 가능" },
        { value: "COMMON", label: "COMMON — 미검증" },
      ] },
      { key: "tube_type", label: "튜브 타입", type: "text" },
      { key: "product_url", label: "상품 URL", type: "text" },
      { key: "seller_name", label: "판매처", type: "text" },
      { key: "price", label: "가격", type: "number" },
      { key: "is_active", label: "활성", type: "boolean" },
    ],
  },
  {
    key: "batteryProducts", label: "배터리 상품", table: "05_battery_product", primaryKey: "battery_product_id",
    searchColumns: ["battery_part_key", "brand_name", "spec_code"],
    fields: [
      { key: "battery_product_id", label: "ID", type: "number", readonly: true },
      { key: "battery_part_key", label: "상품 키", type: "text", required: true },
      { key: "brand_name", label: "브랜드", type: "text", required: true },
      { key: "spec_code", label: "규격 코드", type: "text", required: true },
      { key: "voltage", label: "전압", type: "text" },
      { key: "capacity_ah", label: "용량(Ah)", type: "number" },
      { key: "battery_type", label: "배터리 타입", type: "text" },
      { key: "product_url", label: "상품 URL", type: "text" },
      { key: "seller_name", label: "판매처", type: "text" },
      { key: "price", label: "가격", type: "number" },
      { key: "is_active", label: "활성", type: "boolean" },
    ],
  },
];
