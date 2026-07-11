import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-zinc-800 bg-zinc-950 text-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link className="text-lg font-bold tracking-tight" href="/">
          FitBike
        </Link>
        <Link
          className="text-sm font-semibold text-zinc-300 hover:text-white"
          href="/bike-selector"
        >
          내 바이크 선택
        </Link>
      </div>
    </header>
  );
}
