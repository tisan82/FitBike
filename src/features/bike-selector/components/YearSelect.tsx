import type { YearOption } from "@/features/bike-selector/types/bike-selector.types";

type YearSelectProps = {
  years: YearOption[];
  value: number | null;
  disabled: boolean;
  loading: boolean;
  onChange: (value: number | null) => void;
};

export function YearSelect({ years, value, disabled, loading, onChange }: YearSelectProps) {
  if (disabled) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">연식을 선택하세요</p>
        <p className="text-sm text-foreground-secondary">모델을 먼저 선택하세요</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">연식을 선택하세요</p>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-xl border border-border bg-surface-secondary"
            />
          ))}
        </div>
      </div>
    );
  }

  if (years.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">연식을 선택하세요</p>
        <p className="text-sm text-foreground-secondary">등록된 연식이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">연식을 선택하세요</p>
      <div className="space-y-2">
        {years.map((year) => (
          <button
            key={year.bikeModelYearId}
            onClick={() => onChange(year.bikeModelYearId)}
            aria-pressed={value === year.bikeModelYearId}
            className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 transition-all ${
              value === year.bikeModelYearId
                ? "border-selected-border bg-selected-background"
                : "border-border bg-surface hover:border-primary"
            }`}
            type="button"
          >
            {/* Radio Button */}
            <div
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                value === year.bikeModelYearId
                  ? "border-primary bg-primary"
                  : "border-border bg-surface"
              }`}
            >
              {value === year.bikeModelYearId && (
                <div className="h-2 w-2 rounded-full bg-primary-foreground" />
              )}
            </div>

            {/* Year Info */}
            <div className="flex flex-1 flex-col items-start">
              <p className="text-sm font-semibold text-foreground">
                {year.yearRangeLabel}
              </p>
              {(year.generationName || year.trimName || year.variantName) && (
                <p className="text-xs text-foreground-secondary">
                  {[year.generationName, year.trimName, year.variantName]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>

          </button>
        ))}
      </div>
    </div>
  );
}
