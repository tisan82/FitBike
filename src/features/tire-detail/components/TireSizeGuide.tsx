const GUIDE_ITEMS = [
  ["120", "타이어 폭(mm)"],
  ["70", "편평비(%)"],
  ["ZR", "구조/속도 특성"],
  ["17", "림 직경(inch)"],
  ["58", "하중지수"],
  ["W", "속도등급"],
  ["TL", "튜브리스"],
] as const;

export function TireSizeGuide() {
  return (
    <details className="group rounded-xl border border-border bg-surface px-4 py-3">
      <summary className="cursor-pointer list-none text-base font-semibold text-foreground marker:content-none">
        <span className="flex min-h-11 items-center justify-between gap-4">
          <span className="flex items-center gap-2">
            <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full border border-border text-sm text-foreground-secondary">i</span>
            타이어 규격 보는 법
          </span>
          <span aria-hidden className="text-xl text-primary transition-transform group-open:rotate-45">
            +
          </span>
        </span>
      </summary>
      <div className="pt-5">
        <p className="text-base font-semibold text-foreground">
          120/70ZR17 M/C 58W TL
        </p>
        <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {GUIDE_ITEMS.map(([token, description]) => (
            <div className="grid grid-cols-[3rem_1fr] gap-3" key={token}>
              <dt className="text-base font-semibold text-primary">{token}</dt>
              <dd className="text-base text-foreground-secondary">{description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
