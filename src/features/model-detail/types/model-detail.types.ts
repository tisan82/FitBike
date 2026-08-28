export type TireSpecification = {
  fullSize: string | null;
  width: number | null;
  ratio: number | null;
  diameter: number | null;
  loadIndex: number | null;
  speedIndex: string | null;
  tubeType: string | null;
};

export type ModelYearOption = {
  bikeModelYearId: number;
  yearRangeLabel: string;
  startYear: number;
  endYear: number | null;
};

export type ConnectedProduct = {
  id: number;
  brandName: string;
  productName: string;
  secondaryInformation: string | null;
  detailHref: string | null;
  imageUrl?: string | null;
  price?: number | null;
};

export type RelatedGuide = {
  contentId: number;
  contentKey: string;
  title: string;
  summary: string;
  contentType: "MAINTENANCE" | "DIY" | "PARTS_GUIDE" | "MODEL_GUIDE";
};

export type ModelDetailProductsData = {
  tire: { front: ConnectedProduct[]; rear: ConnectedProduct[] };
  battery: ConnectedProduct[];
  brake: { front: ConnectedProduct[]; rear: ConnectedProduct[] };
};

export type ModelDetailData = {
  bikeModelYearId: number;
  bikeModelId: number;
  brandId: number;
  brandNameEn: string;
  brandNameKo: string | null;
  brandSummary: string | null;
  modelKey: string;
  modelNameEn: string;
  modelNameKo: string | null;
  modelSummary: string | null;
  category: string | null;
  engineCc: number | null;
  generationKey: string | null;
  generationName: string | null;
  frameCode: string | null;
  trimName: string | null;
  variantName: string | null;
  marketCode: string;
  yearRangeLabel: string;
  startYear: number;
  endYear: number | null;
  imageUrl: string | null;
  yearOptions: ModelYearOption[];
  frontTire: TireSpecification;
  rearTire: TireSpecification;
  batteryStandardCode: string | null;
  batteryVoltage: string | null;
  frontBrakeSpec: string | null;
  frontBrakeCaliperType: string | null;
  rearBrakeSpec: string | null;
  rearBrakeCaliperType: string | null;
  modelFeatures: string | null;
  majorChanges: string | null;
  relatedGuides: RelatedGuide[];
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
