import { SelectorField } from "@/features/bike-selector/components/SelectorField";
import type { YearOption } from "@/features/bike-selector/types/bike-selector.types";

type YearSelectProps = {
  years: YearOption[];
  value: number | null;
  disabled: boolean;
  loading: boolean;
  onChange: (value: number | null) => void;
};

function getYearLabel(year: YearOption) {
  const details = [year.generationName, year.trimName, year.variantName].filter(Boolean);
  return details.length > 0 ? `${year.yearRangeLabel} · ${details.join(" · ")}` : year.yearRangeLabel;
}

export function YearSelect({ years, value, disabled, loading, onChange }: YearSelectProps) {
  return (
    <SelectorField id="model-year" label="연식" value={value} disabled={disabled} loading={loading} placeholder="연식을 선택하세요" emptyMessage={disabled ? "모델을 먼저 선택하세요" : "등록된 연식이 없습니다"} hasOptions={years.length > 0} onChange={onChange}>
      {years.map((year) => (
        <option key={year.bikeModelYearId} value={year.bikeModelYearId}>
          {getYearLabel(year)}
        </option>
      ))}
    </SelectorField>
  );
}
