type BikeSelectorSubmitProps = {
  disabled: boolean;
  onPrevious: () => void;
};

export function BikeSelectorSubmit({
  disabled,
  onPrevious,
}: BikeSelectorSubmitProps) {
  return (
    <div className="flex gap-3">
      <button
        className="flex-1 rounded-xl border border-border bg-surface px-5 py-4 text-base font-semibold text-foreground transition hover:bg-surface-secondary disabled:cursor-not-allowed disabled:text-foreground-secondary"
        onClick={onPrevious}
        type="button"
      >
        이전 단계
      </button>
      <button
        className="flex-1 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-border disabled:text-foreground-secondary"
        disabled={disabled}
        type="submit"
      >
        조회하기
      </button>
    </div>
  );
}
