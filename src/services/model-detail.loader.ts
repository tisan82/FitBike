import { cache } from "react";
import {
  getLatestModelDetailBySlugs,
  getModelDetail,
} from "@/services/model-detail.service";
export const getCachedModelDetail = cache(getModelDetail);
export const getCachedLatestModelDetailBySlugs = cache(getLatestModelDetailBySlugs);
