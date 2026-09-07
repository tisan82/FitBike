import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "핏바이크 소개 | 오토바이 부품 규격 정보 서비스",
  description:
    "핏바이크(FitBike)는 오토바이 모델과 연식을 기준으로 타이어, 배터리, 브레이크 등 주요 소모품 규격과 바이크 관리 정보를 제공하는 서비스입니다.",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: "핏바이크 소개 | 오토바이 부품 규격 정보 서비스",
    description:
      "내 바이크의 모델과 연식을 기준으로 타이어·배터리·브레이크 규격과 관리 정보를 확인할 수 있는 핏바이크를 소개합니다.",
    url: "/about",
  },
};

const company = [
  ["운영", "에스와이아이 (개인사업자)"],
  ["대표", "전창수"],
  ["사업자등록번호", "576-61-00395"],
  ["통신판매업 신고번호", "2021-서울양천-0220"],
  ["사업장 소재지", "서울특별시 영등포구 영중로 96, 2층 1호 (07246)"],
] as const;

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">ABOUT FITBIKE</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          내 바이크에 맞는 정보를 더 쉽게
        </h1>
        <p className="mt-5 text-base leading-7 text-foreground-secondary sm:text-lg sm:leading-8">
          핏바이크(FitBike)는 오토바이·모터사이클의 모델과 연식을 기준으로 타이어, 배터리,
          브레이크 등 주요 소모품의 규격과 바이크 관리 정보를 쉽게 확인할 수 있도록 제공하는
          정보 서비스입니다.
        </p>
      </header>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">핏바이크가 제공하는 정보</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            ["모델·연식 확인", "브랜드와 모델, 연식을 기준으로 내 바이크 정보를 탐색합니다."],
            ["부품 규격 정보", "타이어·배터리·브레이크 등 주요 소모품의 규격 정보를 확인합니다."],
            ["바이크 관리 정보", "교체 시기와 점검 방법 등 실제 관리에 필요한 정보를 제공합니다."],
          ].map(([title, body]) => (
            <article key={title} className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-base leading-7 text-foreground-secondary">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">정보 제공 원칙</h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-foreground-secondary">
          핏바이크는 바이크와 부품을 선택할 때 필요한 규격과 관리 정보를 이해하기 쉽게 정리하는
          것을 목표로 합니다. 실제 장착·정비 시에는 차량의 사용설명서, 제조사 공식 정보와 제품의
          최신 사양을 함께 확인해 주세요.
        </p>
        <p className="mt-3 max-w-3xl text-base leading-7 text-foreground-secondary">
          차량 상태와 사양은 연식·트림·시장에 따라 다를 수 있으며, 안전과 관련된 정비는 전문
          정비업체의 확인을 권장합니다.
        </p>
      </section>

      <section className="mt-12 border-t border-border pt-9" aria-labelledby="operator-title">
        <h2 id="operator-title" className="text-xl font-bold text-foreground">운영자 정보</h2>
        <dl className="mt-5 max-w-2xl divide-y divide-border border-y border-border">
          {company.map(([label, value]) => (
            <div key={label} className="grid gap-1 py-4 sm:grid-cols-[160px_1fr] sm:gap-4">
              <dt className="text-sm font-medium text-foreground-secondary">{label}</dt>
              <dd className="text-base text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-base">
          <a className="font-medium text-primary underline-offset-4 hover:underline" href="mailto:changsoo_j@naver.com">
            이메일 문의
          </a>
          <a className="font-medium text-primary underline-offset-4 hover:underline" href="tel:01026400761">
            고객센터 010-2640-0761
          </a>
        </div>
      </section>

      <div className="mt-12">
        <Link className="font-semibold text-primary underline-offset-4 hover:underline" href="/">
          핏바이크 홈으로 이동
        </Link>
      </div>
    </main>
  );
}
