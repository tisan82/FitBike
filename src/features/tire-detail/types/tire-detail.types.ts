export type TirePositionType = "FRONT" | "REAR" | "BOTH" | "COMMON";

export type TireProductDetail = {
  tireProductId: number;
  tireProductKey: string;
  brandName: string;
  productName: string;
  tireSizeFull: string | null;
  width: number | null;
  ratio: number | null;
  diameter: number | null;
  loadIndex: number | null;
  speedIndex: string | null;
  tubeType: string | null;
  positionType: TirePositionType | null;
  productImageUrl: string | null;
  productUrl: string | null;
  sellerName: string | null;
  price: number | null;
  fitmentCount: number;
  model: TireProductModelSummary | null;
  otherSkus: TireModelSku[];
};

export type TireProductModelSummary = {
  tireModelId: number;
  tireModelKey: string;
  displayName: string;
  summary: string | null;
  mainImageUrl: string | null;
};

export type TireModelFeature = {
  number: string;
  title: string;
  description: string | null;
};

export type TireModelSku = {
  tireProductId: number;
  tireProductKey: string;
  tireSizeFull: string | null;
  width: number | null;
  ratio: number | null;
  diameter: number | null;
  loadIndex: number | null;
  speedIndex: string | null;
  tubeType: string | null;
  positionType: TirePositionType | null;
  productImageUrl: string | null;
  productUrl: string | null;
  price: number | null;
  fitmentCount: number;
};

export type TireModelDetailData = {
  tireModelId: number;
  tireModelKey: string;
  brandName: string;
  modelName: string;
  displayName: string;
  summary: string | null;
  description: string | null;
  mainImageUrl: string | null;
  subImageUrl1: string | null;
  subImageUrl2: string | null;
  features: TireModelFeature[];
  skus: TireModelSku[];
};

export type TireProductFitment = {
  bikeModelYearId: number;
  brandName: string;
  modelName: string;
  yearRangeLabel: string;
  position: "FRONT" | "REAR";
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
