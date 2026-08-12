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
        <Link
          className="text-sm font-semibold text-foreground-secondary transition hover:text-primary"
          href="/bike-selector"
        >
          내 바이크 선택
        </Link>
      </div>
    </header>
  );
}
