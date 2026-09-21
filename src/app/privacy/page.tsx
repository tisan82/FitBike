import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "핏바이크 개인정보처리방침입니다.",
  alternates: { canonical: "/privacy" },
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-t border-border pt-8">
    <h2 className="text-xl font-bold text-foreground">{title}</h2>
    <div className="mt-4 space-y-3 text-base leading-7 text-foreground-secondary">{children}</div>
  </section>
);

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header>
        <p className="text-sm font-semibold text-primary">PRIVACY POLICY</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">개인정보처리방침</h1>
        <p className="mt-5 text-base leading-7 text-foreground-secondary">핏바이크는 이용자의 개인정보를 중요하게 생각하며 관련 법령에 따라 안전하게 처리하기 위해 노력합니다.</p>
        <p className="mt-2 text-sm text-foreground-secondary">시행일: 2026년 9월 21일</p>
      </header>
      <div className="mt-10 space-y-9">
        <Section title="1. 개인정보의 처리 목적">
          <p>서비스 운영, 이용 문의 및 오류 제보에 대한 응대, 서비스 안정성 확인을 위해 필요한 범위에서 정보를 처리할 수 있습니다.</p>
        </Section>
        <Section title="2. 처리하는 정보">
          <p>핏바이크는 현재 별도의 회원가입 기능을 제공하지 않습니다. 이용자가 이메일 또는 전화로 문의하는 경우 이름, 이메일 주소, 전화번호 및 문의 내용 등 이용자가 직접 제공한 정보가 처리될 수 있습니다.</p>
          <p>서비스 이용 과정에서 접속 기록, 기기·브라우저 정보, 방문 페이지와 같은 이용 정보가 자동으로 생성될 수 있습니다.</p>
        </Section>
        <Section title="3. Google Analytics 및 Google Tag Manager">
          <p>핏바이크는 서비스 이용 현황을 이해하고 품질을 개선하기 위해 Google Analytics 및 Google Tag Manager를 사용할 수 있습니다. 이 과정에서 쿠키 또는 유사 기술을 통해 방문·이용 정보가 처리될 수 있으며, 해당 서비스의 데이터 처리는 Google의 정책을 따릅니다.</p>
        </Section>
        <Section title="4. 보유 및 이용 기간">
          <p>문의 과정에서 제공된 정보는 문의 처리와 관련 법령상 필요한 기간 동안 보관한 후 목적이 달성되면 지체 없이 파기합니다. 법령에서 별도의 보존 의무를 정한 경우에는 해당 기간 동안 보관할 수 있습니다.</p>
        </Section>
        <Section title="5. 제3자 제공 및 처리 위탁">
          <p>핏바이크는 법령에 근거가 있거나 이용자의 동의가 있는 경우를 제외하고 개인정보를 임의로 제3자에게 제공하지 않습니다. 서비스 운영을 위해 외부 서비스가 사용되는 경우 관련 법령에 따라 필요한 보호조치를 적용합니다.</p>
        </Section>
        <Section title="6. 이용자의 권리">
          <p>이용자는 관련 법령이 정하는 범위에서 자신의 개인정보에 대한 열람, 정정, 삭제 또는 처리정지를 요청할 수 있습니다. 요청은 아래 개인정보 문의처를 통해 접수할 수 있습니다.</p>
        </Section>
        <Section title="7. 개인정보 보호 및 문의">
          <p>운영자: 에스와이아이 · 대표 전창수</p>
          <p>이메일: <a className="text-primary hover:underline" href="mailto:changsoo_j@naver.com">changsoo_j@naver.com</a> · 전화: <a className="text-primary hover:underline" href="tel:01026400761">010-2640-0761</a></p>
        </Section>
        <Section title="8. 방침의 변경">
          <p>서비스 또는 관련 법령의 변경에 따라 본 방침이 변경될 수 있습니다. 중요한 변경이 있는 경우 서비스 내에서 알기 쉬운 방법으로 안내합니다.</p>
        </Section>
      </div>
      <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link className="font-semibold text-primary hover:underline" href="/about">핏바이크 소개</Link>
        <Link className="font-semibold text-primary hover:underline" href="/terms">이용약관</Link>
        <Link className="font-semibold text-primary hover:underline" href="/contact">문의하기</Link>
      </nav>
    </main>
  );
}
