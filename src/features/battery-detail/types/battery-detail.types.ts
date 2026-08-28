export type CompatibleBatteryModel = {
  bikeModelYearId: number;
  brandName: string;
  modelName: string;
  yearRangeLabel: string;
};

export type BatteryProductDetail = {
  batteryProductId: number;
  batteryPartKey: string;
  brandName: string;
  specCode: string;
  voltage: string | null;
  lengthMm: number | null;
  widthMm: number | null;
  heightMm: number | null;
  weightKg: number | null;
  capacityAh: number | null;
  wattHour: number | null;
  internalResistanceMohm: number | null;
  continuousDischargeCca: number | null;
  maxDischargeCca: number | null;
  batteryType: string | null;
  terminalPolarity: string | null;
  terminalType: string | null;
  productImageUrl: string | null;
  productUrl: string | null;
  sellerName: string | null;
  price: number | null;
  compatibleModels: CompatibleBatteryModel[];
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
