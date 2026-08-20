import { cache } from "react";

import { getTireModelDetail } from "@/services/tire-detail.service";

export const getCachedTireModelDetail = cache(getTireModelDetail);
