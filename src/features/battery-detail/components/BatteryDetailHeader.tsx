import Link from "next/link";

export function BatteryDetailHeader() {
  return (
    <header className="space-y-4">
      <Link
        className="inline-flex text-sm font-semibold text-zinc-600 hover:text-zinc-950"
        href="/bike-selector"
      >
        바이크 다시 선택하기
      </Link>
      <div>
        <p className="text-sm font-semibold text-zinc-500">Battery Detail</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950">
          배터리 상품 상세
        </h1>
      </div>
    </header>
  );
}
