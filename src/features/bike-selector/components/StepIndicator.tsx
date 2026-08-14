type StepIndicatorProps = {
  currentStep: 1 | 2 | 3;
};

const steps = [
  { number: 1, label: "브랜드 선택" },
  { number: 2, label: "모델 선택" },
  { number: 3, label: "연식 선택" },
] as const;

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <ol aria-label="바이크 선택 진행 단계" className="flex w-full items-center">
      {steps.map((step, index) => {
        const completed = currentStep > step.number;
        const current = currentStep === step.number;

        return (
          <li
            aria-current={current ? "step" : undefined}
            className={`flex min-w-0 items-center ${index < steps.length - 1 ? "flex-1" : ""}`}
            key={step.number}
          >
            <span className="flex min-w-0 items-center gap-1">
              <span
                aria-hidden="true"
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  completed || current
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-secondary text-foreground-secondary"
                }`}
              >
                {completed ? "✓" : step.number}
              </span>
              <span
                className={`whitespace-nowrap text-xs font-semibold tracking-tight ${
                  current
                    ? "text-primary"
                    : completed
                      ? "text-foreground"
                      : "text-foreground-secondary"
                }`}
              >
                {step.label}
              </span>
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`mx-1 h-0.5 min-w-1 flex-1 rounded-full ${
                  completed ? "bg-primary" : "bg-border"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
