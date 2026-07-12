import Link from "next/link";

export function FitmentResultInvalid() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
      <h2 className="font-bold">올바른 바이크 선택 정보가 필요합니다.</h2>
      <p className="mt-2 text-sm">브랜드, 모델, 연식을 다시 선택해 주세요.</p>
      <Link className="mt-4 inline-flex font-semibold underline" href="/bike-selector">
        바이크 선택으로 이동
      </Link>
    </div>
  );
}
