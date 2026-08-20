import Link from "next/link";

export function TireDetailHeader() {
  return (
    <header>
      <Link
        className="inline-flex min-h-11 items-center text-sm font-semibold text-foreground-secondary hover:text-primary"
        href="/bike-selector"
      >
        바이크 다시 선택하기
      </Link>
    </header>
  );
}
