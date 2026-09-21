import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관",
  description: "핏바이크 서비스 이용약관입니다.",
  alternates: { canonical: "/terms" },
};

const terms = [
  ["제1조 목적", "본 약관은 에스와이아이가 운영하는 핏바이크(FitBike)가 제공하는 정보 서비스의 이용 조건과 기본 사항을 정하는 것을 목적으로 합니다."],
  ["제2조 서비스의 내용", "핏바이크는 오토바이·모터사이클의 모델과 연식을 기준으로 타이어, 배터리, 브레이크 등 주요 부품 규격과 차량 관리 관련 정보를 제공합니다. 서비스의 내용은 운영상 필요에 따라 추가·변경될 수 있습니다."],
  ["제3조 정보 이용 시 확인사항", "핏바이크의 정보는 이용자의 탐색과 이해를 돕기 위한 참고 정보입니다. 같은 모델이라도 연식, 트림, 판매 국가, 차량 개조 및 실제 장착 상태에 따라 사양이 다를 수 있으므로 부품 구매·장착 또는 정비 전에는 차량 사용설명서, 제조사 공식 정보, 실제 차량과 제품의 최신 규격을 함께 확인해야 합니다."],
  ["제4조 안전 및 정비", "안전과 관련된 점검·정비는 차량 상태와 전문적인 판단이 필요할 수 있습니다. 핏바이크의 콘텐츠만을 근거로 안전 관련 작업을 결정하기보다 필요한 경우 제조사 또는 전문 정비업체의 확인을 받으시기 바랍니다."],
  ["제5조 외부 서비스 및 링크", "서비스에는 제조사, 판매처 또는 기타 외부 웹사이트로 연결되는 링크가 포함될 수 있습니다. 외부 서비스의 상품, 가격, 재고, 정책 및 콘텐츠는 해당 운영자가 관리하며 핏바이크의 관리 범위에 포함되지 않습니다."],
  ["제6조 지식재산권", "핏바이크가 직접 작성·제작한 콘텐츠와 서비스 구성에 관한 권리는 관련 법령에 따라 보호됩니다. 이용자는 개인적인 정보 확인 범위를 넘어 무단 복제, 배포 또는 상업적으로 이용해서는 안 됩니다. 제3자의 상표와 자료에 관한 권리는 각 권리자에게 있습니다."],
  ["제7조 서비스 이용 제한", "서비스의 정상적인 운영을 방해하거나 시스템에 과도한 부하를 발생시키는 행위, 법령 또는 타인의 권리를 침해하는 방식의 이용은 제한될 수 있습니다."],
  ["제8조 책임의 범위", "핏바이크는 정확하고 최신의 정보를 제공하기 위해 노력하지만 모든 정보의 완전성이나 특정 차량에 대한 적합성을 보증하지 않습니다. 다만 관련 법령에 따라 운영자에게 책임이 인정되는 경우에는 해당 법령을 따릅니다."],
  ["제9조 약관의 변경", "관련 법령 또는 서비스 내용의 변경에 따라 약관을 변경할 수 있으며, 중요한 변경 사항은 서비스 내에서 알기 쉬운 방법으로 안내합니다."],
  ["제10조 문의", "서비스 이용 및 약관 관련 문의는 핏바이크 문의 페이지 또는 운영자 이메일을 통해 접수할 수 있습니다."],
] as const;

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header>
        <p className="text-sm font-semibold text-primary">TERMS OF USE</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">이용약관</h1>
        <p className="mt-5 text-base leading-7 text-foreground-secondary">핏바이크를 이용하기 전에 서비스의 정보 제공 범위와 이용 조건을 확인해 주세요.</p>
        <p className="mt-2 text-sm text-foreground-secondary">시행일: 2026년 9월 21일</p>
      </header>
      <div className="mt-10 space-y-9">
        {terms.map(([title, body]) => (
          <section key={title} className="border-t border-border pt-8">
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            <p className="mt-4 text-base leading-7 text-foreground-secondary">{body}</p>
          </section>
        ))}
      </div>
      <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link className="font-semibold text-primary hover:underline" href="/about">핏바이크 소개</Link>
        <Link className="font-semibold text-primary hover:underline" href="/privacy">개인정보처리방침</Link>
        <Link className="font-semibold text-primary hover:underline" href="/contact">문의하기</Link>
      </nav>
    </main>
  );
}
