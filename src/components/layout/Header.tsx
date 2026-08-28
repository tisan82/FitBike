import Image from "next/image";
import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-border bg-surface text-foreground">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <Link className="flex h-11 items-center" href="/">
          <Image
            alt="FitBike"
            className="h-11 w-auto origin-center scale-[1.4] object-contain"
            height={64}
            priority
            src="/images/logo/fitbike-logo_1.png"
            width={96}
          />
        </Link>
        <nav aria-label="주요 메뉴" className="flex items-center gap-4 text-sm font-semibold text-foreground-secondary">
          <Link className="transition hover:text-primary" href="/shops">
            정비소 찾기
          </Link>
          <Link className="transition hover:text-primary" href="/bike-selector">
            내 바이크 선택
          </Link>
        </nav>
      </div>
    </header>
  );
}
