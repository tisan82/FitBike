import Link from "next/link";

export function FitmentResultHeader() {
  return (
    <header className="space-y-4">
      <Link
        className="inline-flex text-sm font-semibold text-zinc-600 hover:text-zinc-950"
        href="/bike-selector"
      >
        ← 바이크 다시 선택하기
      </Link>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-zinc-500">FITMENT RESULT</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950">
          내 바이크 장착 가능 상품
        </h1>
        <p className="text-base leading-7 text-zinc-600">
          선택한 모델·연식을 기준으로 확인된 장착 가능 정보를 제공합니다.
        </p>
      </div>
    </header>
  );
}
