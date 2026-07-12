import Link from "next/link";

export function ModelDetailInvalid() {
  return (
    <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <p className="font-semibold text-amber-950">올바른 모델·연식 정보가 필요합니다.</p>
      <Link className="inline-flex text-sm font-semibold text-amber-900 underline" href="/bike-selector">
        바이크 선택하기
      </Link>
    </div>
  );
}
