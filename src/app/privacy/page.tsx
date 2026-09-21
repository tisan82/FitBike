import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "FitBike의 개인정보, 이용정보, 쿠키 및 광고 서비스 관련 처리 기준을 안내합니다.",
  alternates: { canonical: "/privacy" },
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="border-t border-border pt-8">
    <h2 className="text-xl font-bold text-foreground">{title}</h2>
    <div className="mt-4 space-y-4 text-base leading-7 text-foreground-secondary">
      {children}
    </div>
  </section>
);

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">PRIVACY POLICY</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          개인정보처리방침
        </h1>
        <p className="mt-5 text-base leading-7 text-foreground-secondary">
          FitBike는 서비스 이용 과정에서 처리되는 개인정보와 이용정보를 필요한 범위에서
          관리하며, 어떤 정보가 어떤 목적으로 사용되는지 이용자가 확인할 수 있도록 안내합니다.
        </p>
        <p className="mt-2 text-sm text-foreground-secondary">시행일: 2026년 9월 21일</p>
      </header>

      <div className="mt-10 space-y-9">
        <Section title="1. 처리하는 정보">
          <p>
            FitBike는 현재 별도의 회원가입 기능을 제공하지 않습니다. 서비스를 둘러보는 것만으로
            이름, 전화번호, 이메일 주소를 직접 입력하도록 요구하지 않습니다.
          </p>
          <p>
            이용자가 이메일 또는 전화로 직접 문의하는 경우 이름 또는 연락처, 이메일 주소,
            문의 내용과 같이 이용자가 제공한 정보가 문의 처리 과정에서 사용될 수 있습니다.
          </p>
          <p>
            서비스 이용 과정에서는 접속 일시, 방문 페이지, 유입 경로, 기기·브라우저 정보,
            IP 주소, 쿠키 또는 유사 식별자 등의 이용정보가 자동으로 생성되거나 외부 서비스에
            의해 처리될 수 있습니다.
          </p>
        </Section>

        <Section title="2. 정보의 이용 목적">
          <ul className="list-disc space-y-2 pl-5">
            <li>서비스 이용 현황과 방문 흐름 분석</li>
            <li>서비스 품질 및 사용성 개선</li>
            <li>오류 확인과 안정적인 서비스 운영</li>
            <li>이용자의 문의, 정보 오류 제보 및 요청 처리</li>
            <li>광고 서비스 도입 시 광고 제공과 관련 서비스 운영</li>
          </ul>
        </Section>

        <Section title="3. Google Analytics 및 Google Tag Manager">
          <p>
            FitBike는 서비스 이용 현황을 파악하고 개선하기 위해 Google Analytics 및
            Google Tag Manager를 사용할 수 있습니다. 이 과정에서 방문 페이지, 유입 경로,
            기기·브라우저 정보, 이벤트 정보 및 쿠키·유사 식별자 등이 처리될 수 있습니다.
          </p>
          <p>
            이러한 정보는 개별 이용자에게 직접 연락하기 위한 목적이 아니라 서비스 이용 패턴을
            이해하고 기능과 콘텐츠를 개선하기 위한 분석 목적으로 사용합니다.
          </p>
        </Section>

        <Section title="4. 쿠키 및 유사 기술">
          <p>
            쿠키는 웹사이트 이용 과정에서 브라우저에 저장될 수 있는 작은 정보입니다.
            FitBike 및 FitBike가 사용하는 외부 서비스는 서비스 분석, 기능 제공 또는 광고 제공을
            위해 쿠키나 유사 기술을 사용할 수 있습니다.
          </p>
          <p>
            이용자는 사용하는 브라우저의 설정을 통해 쿠키 저장을 제한하거나 삭제할 수 있습니다.
            쿠키를 제한하는 경우 일부 분석 또는 서비스 기능의 동작 방식이 달라질 수 있습니다.
          </p>
        </Section>

        <Section title="5. Google AdSense 및 광고 서비스">
          <p>
            FitBike는 서비스 운영을 위해 Google AdSense 등 광고 서비스를 도입할 수 있습니다.
            광고 서비스가 실제 적용되는 경우 Google을 포함한 제3자 광고 사업자가 광고 제공,
            광고 효과 측정 및 관련 기능을 위해 이용자의 브라우저에 쿠키를 저장하거나 기존 쿠키를
            읽을 수 있으며, 웹 비콘, IP 주소 또는 기타 식별자를 사용할 수 있습니다.
          </p>
          <p>
            Google 및 Google의 파트너는 광고 쿠키를 이용하여 이용자의 FitBike 방문 또는 다른
            웹사이트 방문 정보를 바탕으로 광고를 제공할 수 있습니다. 맞춤형 광고가 사용되는 경우
            이용자는 Google 광고 설정에서 맞춤형 광고에 관한 설정을 관리할 수 있습니다.
          </p>
          <p>
            현재 광고 서비스가 적용되지 않은 경우 이 조항은 향후 광고 서비스 도입 시 적용될
            처리 기준을 안내하기 위한 것입니다. 실제 광고 서비스 도입 시 적용되는 사업자와
            처리 내용을 기준으로 본 방침을 다시 확인하고 필요한 내용을 갱신합니다.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href="https://adssettings.google.com/"
              target="_blank"
              rel="noreferrer"
            >
              Google 광고 설정
            </a>
            <a
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href="https://policies.google.com/technologies/partner-sites?hl=ko"
              target="_blank"
              rel="noreferrer"
            >
              Google 파트너 사이트의 정보 사용 안내
            </a>
          </div>
        </Section>

        <Section title="6. 개인정보의 보유 및 파기">
          <p>
            이용자가 문의 과정에서 직접 제공한 개인정보는 문의 처리에 필요한 기간 동안 보관하고,
            처리 목적이 달성되어 더 이상 보관할 필요가 없으면 지체 없이 파기합니다.
          </p>
          <p>
            관련 법령에 따라 일정 기간 보관해야 하는 정보가 있는 경우에는 해당 법령에서 정한
            기간 동안 보관할 수 있습니다. 외부 분석·광고 서비스에서 처리되는 정보의 보관 기준은
            해당 서비스의 설정 및 정책에 따를 수 있습니다.
          </p>
        </Section>

        <Section title="7. 외부 서비스와 정보 처리">
          <p>
            FitBike는 서비스 운영을 위해 분석, 호스팅, 데이터 저장, 광고 등 외부 서비스를
            사용할 수 있습니다. 외부 사업자가 정보를 처리하는 경우 해당 사업자의 정책과
            관련 법령에 따라 정보가 처리될 수 있습니다.
          </p>
          <p>
            FitBike는 이용자의 개인정보를 임의로 판매하지 않으며, 법령에 근거가 있거나
            이용자의 동의가 필요한 경우에는 관련 절차를 따릅니다.
          </p>
        </Section>

        <Section title="8. 해외 이용자와 광고 동의">
          <p>
            Google 광고 서비스를 적용한 이후 유럽경제지역(EEA), 영국 또는 스위스 이용자에게
            광고를 제공하는 경우 Google의 관련 정책과 적용 법령에 따라 쿠키 및 개인정보 이용에
            대한 동의 절차가 제공될 수 있습니다.
          </p>
        </Section>

        <Section title="9. 이용자의 권리">
          <p>
            이용자는 관련 법령이 정하는 범위에서 FitBike가 처리하는 자신의 개인정보에 대해
            열람, 정정, 삭제 또는 처리정지를 요청할 수 있습니다. 직접 문의 과정에서 제공한
            개인정보에 관한 요청은 아래 연락처를 통해 접수할 수 있습니다.
          </p>
        </Section>

        <Section title="10. 개인정보 관련 문의">
          <p>운영자: 에스와이아이 · 대표 전창수</p>
          <p>
            이메일:{" "}
            <a className="font-semibold text-primary hover:underline" href="mailto:changsoo_j@naver.com">
              changsoo_j@naver.com
            </a>
          </p>
          <p>
            전화:{" "}
            <a className="font-semibold text-primary hover:underline" href="tel:01026400761">
              010-2640-0761
            </a>
          </p>
        </Section>

        <Section title="11. 개인정보처리방침의 변경">
          <p>
            서비스 기능, 사용하는 외부 서비스 또는 관련 법령이 변경되면 본 개인정보처리방침도
            변경될 수 있습니다. 중요한 변경 사항이 있는 경우 서비스에서 확인할 수 있도록
            안내하고 시행일을 갱신합니다.
          </p>
        </Section>
      </div>

      <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link className="font-semibold text-primary hover:underline" href="/about">
          핏바이크 소개
        </Link>
        <Link className="font-semibold text-primary hover:underline" href="/terms">
          이용약관
        </Link>
        <Link className="font-semibold text-primary hover:underline" href="/contact">
          문의하기
        </Link>
      </nav>
    </main>
  );
}
