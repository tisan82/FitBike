export type FitmentPositionType = "FRONT" | "REAR";

export type SelectedBikeSummary = {
  bikeModelYearId: number;
  bikeModelId: number;
  brandId: number;
  brandNameEn: string;
  brandNameKo: string | null;
  modelKey: string;
  modelNameEn: string;
  modelNameKo: string | null;
  category: string | null;
  engineCc: number | null;
  generationName: string | null;
  yearRangeLabel: string;
  startYear: number;
  endYear: number | null;
  imageUrl: string | null;
  frontTireFullSize: string | null;
  rearTireFullSize: string | null;
};

export type TireFitmentProduct = {
  fitmentId: number;
  tireProductId: number;
  tireProductKey: string;
  fitmentPositionType: FitmentPositionType;
  productPositionType: "FRONT" | "REAR" | "BOTH" | "COMMON" | null;
  matchType: string;
  displayOrder: number;
  brandName: string;
  productName: string;
  tireSizeFull: string | null;
  width: number | null;
  ratio: number | null;
  diameter: number | null;
  loadIndex: number | null;
  speedIndex: string | null;
  tubeType: string | null;
  productImageUrl: string | null;
  productUrl: string | null;
  sellerName: string | null;
  price: number | null;
};

export type FitmentResultData = {
  selectedBike: SelectedBikeSummary;
  tireProducts: TireFitmentProduct[];
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
