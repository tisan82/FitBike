export type BrandOption = {
  brandId: number;
  brandKey: string;
  brandNameEn: string;
  brandNameKo: string | null;
  logoImageUrl: string | null;
};

export type ModelOption = {
  bikeModelId: number;
  modelKey: string;
  modelNameEn: string;
  modelNameKo: string | null;
  category: string | null;
  engineCc: number | null;
};

export type YearOption = {
  bikeModelYearId: number;
  yearRangeLabel: string;
  startYear: number;
  endYear: number | null;
  generationName: string | null;
  trimName: string | null;
  variantName: string | null;
};

export type BikeSelectorState = {
  selectedBrandId: number | null;
  selectedModelId: number | null;
  selectedModelYearId: number | null;
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
