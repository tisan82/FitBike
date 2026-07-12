import { useState } from "react";

import type { BikeSelectorState } from "@/features/bike-selector/types/bike-selector.types";

const initialState: BikeSelectorState = {
  selectedBrandId: null,
  selectedModelId: null,
  selectedModelYearId: null,
};

export function useBikeSelector() {
  const [state, setState] = useState<BikeSelectorState>(initialState);

  const selectBrand = (brandId: number | null) => {
    setState({ selectedBrandId: brandId, selectedModelId: null, selectedModelYearId: null });
  };

  const selectModel = (modelId: number | null) => {
    setState((current) => ({ ...current, selectedModelId: modelId, selectedModelYearId: null }));
  };

  const selectModelYear = (modelYearId: number | null) => {
    setState((current) => ({ ...current, selectedModelYearId: modelYearId }));
  };

  return {
    ...state,
    canSubmit: state.selectedModelYearId !== null,
    selectBrand,
    selectModel,
    selectModelYear,
  };
}
