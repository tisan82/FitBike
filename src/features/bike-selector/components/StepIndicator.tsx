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
    <ol
      aria-label="바이크 선택 진행 단계"
      className="grid w-full grid-cols-3"
    >
      {steps.map((step, index) => {
        const completed = currentStep > step.number;
        const current = currentStep === step.number;

        return (
          <li
            aria-current={current ? "step" : undefined}
            className="relative flex min-w-0 flex-col items-center gap-1 text-center"
            key={step.number}
          >
            <span
              aria-hidden="true"
              className={`flex size-7 items-center justify-center rounded-full text-sm font-bold ${
                completed || current
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-secondary text-foreground-secondary"
              }`}
            >
              {completed ? "✓" : step.number}
            </span>
            <span
              className={`whitespace-nowrap text-sm font-semibold leading-5 ${
                current
                  ? "text-primary"
                  : completed
                    ? "text-foreground"
                    : "text-foreground-secondary"
              }`}
            >
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-3 h-0.5 rounded-full ${
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
