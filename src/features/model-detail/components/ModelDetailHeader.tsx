import Link from "next/link";

export function ModelDetailHeader() {
  return (
    <header className="space-y-4">
      <Link
        className="inline-flex text-sm font-semibold text-zinc-600 hover:text-zinc-950"
        href="/bike-selector"
      >
        ← 바이크 다시 선택하기
      </Link>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-zinc-500">MODEL DETAIL</p>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-950">
          바이크 상세 정보
        </h1>
        <p className="text-base leading-7 text-zinc-600">
          선택한 모델·연식의 기본 정보와 부품 규격을 확인합니다.
        </p>
      </div>
    </header>
  );
}
