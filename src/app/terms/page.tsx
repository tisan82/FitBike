import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관",
  description: "FitBike 서비스의 정보 제공 범위와 이용 조건을 안내합니다.",
  alternates: { canonical: "/terms" },
};

const terms = [
  {
    title: "제1조 목적",
    body: (
      <p>
        본 약관은 에스와이아이가 운영하는 FitBike(이하 “서비스”)가 제공하는 오토바이·모터사이클
        정보 서비스의 이용 조건과 운영자 및 이용자의 기본적인 권리와 의무를 정하는 것을 목적으로 합니다.
      </p>
    ),
  },
  {
    title: "제2조 서비스의 내용",
    body: (
      <>
        <p>
          FitBike는 바이크의 브랜드, 모델 및 연식을 기준으로 차량 정보와 타이어·배터리·브레이크 등
          주요 부품의 규격·제품 정보, 점검 및 관리 관련 콘텐츠를 제공합니다.
        </p>
        <p>
          서비스에서 제공하는 정보의 종류와 범위는 데이터 확보 상황과 서비스 운영 방향에 따라
          추가되거나 변경될 수 있습니다.
        </p>
      </>
    ),
  },
  {
    title: "제3조 정보의 성격과 이용",
    body: (
      <>
        <p>
          FitBike의 차량·부품·관리 정보는 이용자가 자신의 바이크와 관련된 정보를 탐색하고 이해하는 데
          도움을 주기 위한 정보입니다.
        </p>
        <p>
          같은 모델명이라도 연식, 세부 트림, 판매 국가, 제조 시점, 차량 개조 또는 실제 장착 상태에
          따라 사양이 다를 수 있습니다. 이용자는 중요한 의사결정 전에 자신의 차량과 해당 제품의
          실제 정보를 함께 확인해야 합니다.
        </p>
      </>
    ),
  },
  {
    title: "제4조 부품 규격 및 정비 정보",
    body: (
      <>
        <p>
          타이어, 배터리, 브레이크 등 부품을 구매하거나 장착하기 전에는 차량 사용설명서,
          제조사 공식 정보, 실제 차량에 표시된 규격 및 구매하려는 제품의 최신 사양을 확인해 주세요.
        </p>
        <p>
          정비·점검 콘텐츠는 일반적인 정보 제공을 목적으로 합니다. 차량 상태에 대한 진단이나
          전문 정비를 대신하지 않으며, 안전에 영향을 줄 수 있는 작업은 필요한 경우 제조사 또는
          전문 정비업체를 통해 확인하는 것이 적절합니다.
        </p>
      </>
    ),
  },
  {
    title: "제5조 외부 사이트 및 구매처",
    body: (
      <>
        <p>
          FitBike에는 제조사, 자료 제공처, 온라인 판매처 등 외부 웹사이트로 연결되는 링크가 포함될
          수 있습니다. 외부 사이트로 이동한 이후 제공되는 서비스에는 해당 사이트의 이용조건과
          정책이 적용됩니다.
        </p>
        <p>
          외부 판매처의 상품 가격, 할인, 재고, 배송, 반품, 결제 및 상품 설명은 해당 판매처가
          관리합니다. FitBike에 표시된 외부 상품 정보가 있는 경우에도 구매 시점의 실제 판매 조건은
          해당 판매처에서 다시 확인해야 합니다.
        </p>
      </>
    ),
  },
  {
    title: "제6조 콘텐츠와 지식재산권",
    body: (
      <>
        <p>
          FitBike가 직접 작성하거나 제작한 글, 편집물, 서비스 구성 및 기타 콘텐츠는 관련 법령에 따라
          보호됩니다. 이용자는 개인적인 정보 확인 범위를 넘어 운영자의 허락 없이 이를 무단 복제,
          재배포하거나 상업적으로 이용해서는 안 됩니다.
        </p>
        <p>
          서비스에서 식별을 위해 표시하는 제조사명, 브랜드명, 제품명, 상표 및 제3자가 권리를 가진
          자료에 관한 권리는 각 권리자에게 있습니다.
        </p>
      </>
    ),
  },
  {
    title: "제7조 이용 시 금지행위",
    body: (
      <>
        <p>이용자는 다음과 같이 서비스의 정상적인 운영이나 다른 사람의 권리를 침해하는 행위를 해서는 안 됩니다.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>서비스 또는 서버에 비정상적인 부하를 발생시키는 행위</li>
          <li>서비스의 보안 기능을 우회하거나 정상적인 동작을 방해하는 행위</li>
          <li>콘텐츠 또는 데이터를 권한 없이 대량으로 복제·재배포하는 행위</li>
          <li>타인의 권리 또는 관련 법령을 침해하는 방식으로 서비스를 이용하는 행위</li>
        </ul>
      </>
    ),
  },
  {
    title: "제8조 서비스의 변경 및 일시 중단",
    body: (
      <p>
        FitBike는 데이터 갱신, 기능 개선, 시스템 점검, 장애 대응 또는 운영상 필요한 경우 서비스의
        일부 기능이나 제공 정보를 변경하거나 일시적으로 이용을 제한할 수 있습니다. 중요한 변경이
        이용자에게 영향을 주는 경우 서비스에서 확인할 수 있도록 안내하기 위해 노력합니다.
      </p>
    ),
  },
  {
    title: "제9조 책임의 범위",
    body: (
      <>
        <p>
          FitBike는 신뢰할 수 있는 정보를 제공하기 위해 데이터를 점검하고 보완하지만, 서비스에
          표시되는 모든 정보가 모든 차량의 실제 상태 또는 최신 제품 사양과 항상 일치한다고
          보장할 수는 없습니다.
        </p>
        <p>
          이용자가 외부 판매처에서 체결하는 구매·결제·배송 등의 거래는 해당 판매처와 이용자 사이의
          거래입니다. 다만 FitBike 운영자에게 관련 법령에 따른 책임이 인정되는 경우에는 해당 법령을
          따릅니다.
        </p>
      </>
    ),
  },
  {
    title: "제10조 개인정보 보호",
    body: (
      <p>
        서비스 이용 과정에서 처리되는 개인정보와 이용정보에 관한 사항은{" "}
        <Link className="font-semibold text-primary hover:underline" href="/privacy">
          개인정보처리방침
        </Link>
        에서 확인할 수 있습니다.
      </p>
    ),
  },
  {
    title: "제11조 약관의 변경",
    body: (
      <p>
        서비스 내용이나 관련 법령의 변경 등에 따라 본 약관을 변경할 수 있습니다. 약관이 변경되는
        경우 변경된 내용과 시행일을 서비스에서 확인할 수 있도록 안내합니다.
      </p>
    ),
  },
  {
    title: "제12조 문의",
    body: (
      <p>
        서비스 이용, 정보 오류 또는 본 약관과 관련한 문의는{" "}
        <Link className="font-semibold text-primary hover:underline" href="/contact">
          문의하기
        </Link>
        를 통해 접수할 수 있습니다.
      </p>
    ),
  },
] as const;

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">TERMS OF USE</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          이용약관
        </h1>
        <p className="mt-5 text-base leading-7 text-foreground-secondary">
          FitBike가 제공하는 정보의 범위와 서비스를 이용할 때 확인해야 할 기본 조건을 안내합니다.
        </p>
        <p className="mt-2 text-sm text-foreground-secondary">시행일: 2026년 9월 21일</p>
      </header>

      <div className="mt-10 space-y-9">
        {terms.map(({ title, body }) => (
          <section key={title} className="border-t border-border pt-8">
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            <div className="mt-4 space-y-4 text-base leading-7 text-foreground-secondary">
              {body}
            </div>
          </section>
        ))}
      </div>

      <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link className="font-semibold text-primary hover:underline" href="/about">
          핏바이크 소개
        </Link>
        <Link className="font-semibold text-primary hover:underline" href="/privacy">
          개인정보처리방침
        </Link>
        <Link className="font-semibold text-primary hover:underline" href="/contact">
          문의하기
        </Link>
      </nav>
    </main>
  );
}
