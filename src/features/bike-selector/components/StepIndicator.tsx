type StepIndicatorProps = {
  currentStep: 1 | 2 | 3;
};

const steps = [
  { number: 1, label: "브랜드 선택" },
  { number: 2, label: "모델 선택" },
  { number: 3, label: "연식 선택" },
];

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  return (
    <ol
      aria-label="바이크 선택 진행 단계"
      className="mb-8 flex items-center justify-center gap-2 sm:gap-4"
    >
      {steps.map((step, index) => (
        <li
          key={step.number}
          aria-current={currentStep === step.number ? "step" : undefined}
          className="flex items-center gap-2 sm:gap-4"
        >
          {/* Step Circle */}
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition-all sm:h-12 sm:w-12 ${
              currentStep >= step.number
                ? "bg-primary text-primary-foreground"
                : "bg-surface-secondary text-foreground-secondary"
            }`}
          >
            {currentStep > step.number ? "✓" : step.number}
          </div>

          {/* Label */}
          <p
            className={`hidden text-xs font-semibold sm:inline ${
              currentStep >= step.number
                ? "text-foreground"
                : "text-foreground-secondary"
            }`}
          >
            {step.label}
          </p>

          {/* Connector Line */}
          {index < steps.length - 1 && (
            <div
              className={`mx-1 hidden h-1 w-8 rounded-full transition-all sm:inline ${
                currentStep > step.number ? "bg-primary" : "bg-border"
              }`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
