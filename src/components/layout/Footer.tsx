import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-secondary px-5 py-7 text-foreground-secondary">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-3 text-sm leading-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link className="font-semibold text-foreground hover:underline" href="/about">
              핏바이크 소개
            </Link>
            <a className="hover:underline" href="mailto:changsoo_j@naver.com">
              문의하기
            </a>
          </div>

          <p>
            핏바이크(FitBike) · 운영 에스와이아이 · 대표 전창수 · 사업자등록번호 576-61-00395
          </p>
          <p>
            통신판매업 신고번호 2021-서울양천-0220 · 서울특별시 영등포구 영중로 96, 2층 1호
          </p>
          <p>
            고객센터 <a className="hover:underline" href="tel:01026400761">010-2640-0761</a>
            {" · "}
            <a className="hover:underline" href="mailto:changsoo_j@naver.com">changsoo_j@naver.com</a>
          </p>

          <p className="pt-1 text-xs">© {new Date().getFullYear()} FitBike. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
