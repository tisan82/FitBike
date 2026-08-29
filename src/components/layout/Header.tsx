import Image from "next/image";
import Link from "next/link";

import { MyBikeLink } from "@/components/layout/MyBikeLink";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 text-foreground backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-5">
        <Link aria-label="FitBike 홈" className="flex h-11 flex-none items-center" href="/">
          <Image
            alt="FitBike"
            className="h-11 w-auto origin-center scale-[1.35] object-contain"
            height={64}
            priority
            src="/images/logo/fitbike-logo_1.png"
            width={96}
          />
        </Link>
        <nav aria-label="주요 메뉴" className="flex min-w-0 items-center gap-3 text-sm font-semibold text-foreground-secondary sm:gap-5">
          <Link className="hidden whitespace-nowrap transition hover:text-primary sm:inline" href="/contents">가이드</Link>
          <Link className="whitespace-nowrap transition hover:text-primary" href="/shops">정비소</Link>
          <MyBikeLink />
        </nav>
      </div>
    </header>
  );
}
