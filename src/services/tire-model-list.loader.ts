import { cache } from "react";

import { getActiveTireModelsByBrandName } from "@/services/tire-detail.service";

export const getCachedActiveTireModelsByBrandName = cache(
  getActiveTireModelsByBrandName,
);
