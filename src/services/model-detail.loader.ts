import { cache } from "react";
import { getModelDetail } from "@/services/model-detail.service";
export const getCachedModelDetail = cache(getModelDetail);
