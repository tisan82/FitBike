export type TirePositionType = "FRONT" | "REAR" | "COMMON" | "UNKNOWN";

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
