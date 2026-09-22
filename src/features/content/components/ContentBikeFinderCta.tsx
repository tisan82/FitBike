import Link from "next/link";

type PartFocus = "battery" | "brake" | "all";

function detectPartFocus(title: string): PartFocus {
  if (/배터리/.test(title)) return "battery";
  if (/브레이크|패드/.test(title)) return "brake";
  return "all";
}

const partLabels = {
  battery: {
    name: "배터리",
    description: "브랜드·모델·연식을 선택하면 내 바이크에 맞는 배터리 규격과 연결 상품을 확인할 수 있습니다.",
  },
  brake: {
    name: "브레이크 패드",
    description: "브랜드·모델·연식을 선택하면 내 바이크에 맞는 브레이크 규격과 연결 상품을 확인할 수 있습니다.",
  },
} as const;

function FinderLink({ part, secondary = false }: { part: "battery" | "brake"; secondary?: boolean }) {
  const label = partLabels[part].name;
  return (
    <Link
      className={`inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 py-3 text-center font-bold transition sm:w-auto ${
        secondary
          ? "border border-border bg-surface text-foreground hover:border-primary hover:text-primary"
          : "bg-primary text-primary-foreground hover:bg-primary-hover"
      }`}
      href={`/bike-selector?part=${part}`}
    >
      내 바이크 {label} 확인
      <span aria-hidden="true" className="ml-2">→</span>
    </Link>
  );
}

export function ContentBikeFinderCta({ title }: { title: string }) {
  const focus = detectPartFocus(title);
  const description = focus === "all"
    ? "점검 결과 교체가 필요하다면 먼저 내 바이크의 브랜드·모델·연식을 선택해 정확한 부품 정보를 확인하세요."
    : partLabels[focus].description;

  return (
    <aside className="mt-7 overflow-hidden rounded-2xl border border-selected-border bg-selected-background" aria-labelledby="content-bike-finder-title">
      <div className="p-5 sm:p-6">
        <p className="text-sm font-bold text-primary">내 바이크 기준으로 확인</p>
        <h2 id="content-bike-finder-title" className="mt-2 text-xl font-bold leading-8">
          점검 후에는 내 모델·연식에 맞는 부품을 확인하세요
        </h2>
        <p className="mt-2 text-base leading-7 text-foreground-secondary">{description}</p>

        <ol className="mt-5 grid gap-2 text-sm font-medium sm:grid-cols-3" aria-label="내 바이크 부품 확인 순서">
          <li className="rounded-xl bg-surface px-4 py-3"><span className="mr-2 font-bold text-primary">1</span>브랜드 선택</li>
          <li className="rounded-xl bg-surface px-4 py-3"><span className="mr-2 font-bold text-primary">2</span>모델·연식 선택</li>
          <li className="rounded-xl bg-surface px-4 py-3"><span className="mr-2 font-bold text-primary">3</span>맞는 부품 확인</li>
        </ol>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {focus === "battery" ? <FinderLink part="battery" /> : null}
          {focus === "brake" ? <FinderLink part="brake" /> : null}
          {focus === "all" ? (
            <>
              <FinderLink part="battery" />
              <FinderLink part="brake" secondary />
            </>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
