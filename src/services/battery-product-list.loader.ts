import { cache } from "react";

import { getActiveBatteryProductsByBrandName } from "@/services/battery-detail.service";

export const getCachedActiveBatteryProductsByBrandName = cache(
  getActiveBatteryProductsByBrandName,
);
