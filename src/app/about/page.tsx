import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "핏바이크 소개 | 내 바이크에 맞는 부품 규격과 관리 정보",
  description:
    "핏바이크(FitBike)는 오토바이 모델과 연식을 기준으로 타이어, 배터리, 브레이크 등 주요 부품 규격과 바이크 관리 정보를 찾을 수 있는 서비스입니다.",
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    title: "핏바이크 소개 | 내 바이크에 맞는 부품 규격과 관리 정보",
    description:
      "브랜드·모델·연식을 기준으로 내 바이크에 필요한 부품 규격과 관리 정보를 한곳에서 확인하세요.",
    url: "/about",
  },
};

const services = [
  {
    title: "내 바이크 찾기",
    body: "브랜드에서 모델과 연식을 차례로 선택해 내가 타는 바이크의 정보를 찾을 수 있습니다.",
  },
  {
    title: "부품 규격 확인",
    body: "차량을 기준으로 타이어, 배터리, 브레이크 등 주요 부품의 연결된 규격과 제품 정보를 확인할 수 있습니다.",
  },
  {
    title: "점검·관리 정보",
    body: "교체 시기, 점검 방법, 규격을 확인할 때 알아두면 좋은 내용을 콘텐츠로 제공합니다.",
  },
] as const;

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10 sm:py-14">
      <header className="max-w-3xl">
        <Image
          src="/images/logo/fitbike-logo_1.png"
          alt="FitBike"
          width={220}
          height={72}
          priority
          className="h-auto w-[180px] sm:w-[220px]"
        />
        <p className="mt-7 text-sm font-semibold text-primary">ABOUT FITBIKE</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          내 바이크에 맞는 정보를 찾는 곳
        </h1>
        <p className="mt-5 text-base leading-7 text-foreground-secondary sm:text-lg sm:leading-8">
          핏바이크(FitBike)는 오토바이·모터사이클의 브랜드, 모델, 연식을 기준으로
          타이어·배터리·브레이크 등 주요 부품 규격과 바이크 관리 정보를 연결해 보여주는
          정보 서비스입니다.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/bike-selector"
            className="rounded-lg bg-primary px-5 py-3 text-base font-semibold text-white transition hover:bg-primary-hover"
          >
            내 바이크 찾기
          </Link>
          <Link
            href="/contents"
            className="rounded-lg border border-border px-5 py-3 text-base font-semibold text-foreground transition hover:bg-surface-secondary"
          >
            바이크 관리 정보 보기
          </Link>
        </div>
      </header>

      <section className="mt-14 border-t border-border pt-10">
        <h2 className="text-xl font-bold text-foreground">왜 FitBike를 만들었나요?</h2>
        <div className="mt-4 max-w-3xl space-y-4 text-base leading-7 text-foreground-secondary">
          <p>
            오토바이 부품을 찾을 때는 단순히 제품 이름만 알아서는 충분하지 않은 경우가 많습니다.
            같은 모델명이라도 연식에 따라 규격이 달라질 수 있고, 타이어의 앞·뒤 규격이나
            배터리·브레이크처럼 부품마다 확인해야 하는 정보도 다릅니다.
          </p>
          <p>
            FitBike는 제품부터 찾는 대신 <strong className="font-semibold text-foreground">내 바이크를 먼저 찾고,
            그 차량에 연결된 정보를 확인하는 방식</strong>으로 이 과정을 더 쉽게 만들고자 합니다.
            여러 곳에 흩어진 차량과 부품 정보를 모델과 연식을 중심으로 연결하는 것이 FitBike의 역할입니다.
          </p>
        </div>
      </section>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">FitBike에서 할 수 있는 것</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {services.map(({ title, body }) => (
            <article key={title} className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-base leading-7 text-foreground-secondary">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">정보는 이렇게 연결합니다</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          {[
            ["01", "브랜드", "제조사를 선택합니다."],
            ["02", "모델", "바이크 모델을 찾습니다."],
            ["03", "연식", "해당 차량의 연식을 선택합니다."],
            ["04", "부품·관리", "연결된 규격과 관리 정보를 확인합니다."],
          ].map(([step, title, body]) => (
            <div key={step} className="rounded-xl bg-surface-secondary p-5">
              <span className="text-sm font-bold text-primary">{step}</span>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-foreground-secondary">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">정보를 다루는 기준</h2>
        <div className="mt-4 max-w-3xl space-y-4 text-base leading-7 text-foreground-secondary">
          <p>
            FitBike는 모델과 연식에 맞는 정보를 이해하기 쉽게 구조화하고, 제조사 공식 자료와
            확인 가능한 제품 정보를 기준으로 데이터를 지속적으로 점검하고 보완합니다.
          </p>
          <p>
            특정 제품의 순위를 매기거나 일방적으로 선택을 권하기보다, 라이더가 자신의 바이크와
            사용 상황에 맞는 정보를 확인하고 판단할 수 있도록 필요한 규격과 관리 정보를 제공하는 것을
            기본 원칙으로 합니다.
          </p>
        </div>
      </section>

      <section className="mt-12 rounded-2xl bg-surface-secondary p-6 sm:p-8">
        <h2 className="text-xl font-bold text-foreground">정보가 다르거나 빠져 있나요?</h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-foreground-secondary">
          실제 차량과 다른 규격, 누락된 모델·연식 또는 수정이 필요한 콘텐츠를 발견했다면 알려주세요.
          확인 가능한 정보를 검토해 FitBike 데이터를 계속 보완하겠습니다.
        </p>
        <Link
          href="/contact"
          className="mt-5 inline-flex font-semibold text-primary underline-offset-4 hover:underline"
        >
          정보 오류 및 서비스 문의하기
        </Link>
      </section>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">운영</h2>
        <p className="mt-4 text-base leading-7 text-foreground-secondary">
          FitBike는 에스와이아이가 운영합니다. 사업자 정보와 연락처는 페이지 하단에서 확인할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
