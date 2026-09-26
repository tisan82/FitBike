import Link from "next/link";

export function BatteryDetailHeader() {
  return (
    <header>
      <Link
        className="inline-flex text-sm font-semibold text-zinc-600 hover:text-zinc-950"
        href="/bike-selector"
      >
        바이크 다시 선택하기
      </Link>
    </header>
  );
}
