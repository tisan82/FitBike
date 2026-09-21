import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "문의하기",
  description: "FitBike의 모델·연식, 부품 규격, 콘텐츠 오류, 개인정보 및 서비스 관련 문의 안내입니다.",
  alternates: { canonical: "/contact" },
};

const categories = [
  ["모델·연식 정보", "등록된 바이크의 모델명, 연식 또는 차량 정보가 실제 차량과 다른 경우"],
  ["부품 규격 정보", "타이어·배터리·브레이크 등 연결된 부품 규격이나 제품 정보의 확인이 필요한 경우"],
  ["콘텐츠", "점검·관리 콘텐츠에서 수정하거나 보완할 내용을 발견한 경우"],
  ["개인정보", "개인정보의 열람·정정·삭제·처리정지 등 개인정보 처리와 관련한 문의"],
  ["제휴·자료 제공", "서비스 제휴, 공식 자료 제공, 브랜드·제품 정보와 관련한 문의"],
  ["서비스 이용", "그 밖의 FitBike 이용 중 발생한 오류나 불편 사항"],
] as const;

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">CONTACT</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          문의하기
        </h1>
        <p className="mt-5 text-base leading-7 text-foreground-secondary">
          FitBike의 모델·연식, 부품 규격 또는 콘텐츠에서 잘못된 정보를 발견했거나
          서비스 이용 중 확인이 필요한 내용이 있다면 알려주세요.
        </p>
      </header>

      <section className="mt-10 rounded-2xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="text-xl font-bold text-foreground">문의처</h2>
        <p className="mt-3 text-base leading-7 text-foreground-secondary">
          아래 이메일 또는 고객센터를 통해 문의할 수 있습니다.
        </p>
        <dl className="mt-6 grid gap-x-5 gap-y-5 text-base sm:grid-cols-[110px_1fr]">
          <dt className="font-medium text-foreground-secondary">이메일</dt>
          <dd>
            <a
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href="mailto:changsoo_j@naver.com"
            >
              changsoo_j@naver.com
            </a>
          </dd>
          <dt className="font-medium text-foreground-secondary">고객센터</dt>
          <dd>
            <a
              className="font-semibold text-primary underline-offset-4 hover:underline"
              href="tel:01026400761"
            >
              010-2640-0761
            </a>
          </dd>
        </dl>
      </section>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">문의할 수 있는 내용</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {categories.map(([title, body]) => (
            <article key={title} className="rounded-xl border border-border p-5">
              <h3 className="text-lg font-semibold text-foreground">{title}</h3>
              <p className="mt-2 text-base leading-7 text-foreground-secondary">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">정보 오류를 알려주실 때</h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-foreground-secondary">
          차량이나 부품 정보에 대한 문의라면 아래 내용을 함께 보내주시면 확인에 도움이 됩니다.
        </p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-7 text-foreground-secondary">
          <li>바이크 브랜드와 모델명</li>
          <li>연식</li>
          <li>확인한 FitBike 페이지 주소</li>
          <li>잘못되었거나 확인이 필요한 내용</li>
          <li>가능한 경우 확인에 참고할 수 있는 제조사 또는 제품 정보</li>
        </ul>
        <p className="mt-4 max-w-3xl text-base leading-7 text-foreground-secondary">
          접수된 내용은 확인 가능한 자료와 FitBike 데이터를 비교해 검토합니다.
        </p>
      </section>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">개인정보 관련 문의</h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-foreground-secondary">
          개인정보 처리에 관한 문의와 열람·정정·삭제·처리정지 요청도 위 문의처를 통해 접수할 수
          있습니다. 개인정보 처리 기준은{" "}
          <Link className="font-semibold text-primary hover:underline" href="/privacy">
            개인정보처리방침
          </Link>
          에서 확인할 수 있습니다.
        </p>
      </section>

      <section className="mt-12 rounded-2xl bg-surface-secondary p-6 sm:p-8">
        <h2 className="text-xl font-bold text-foreground">FitBike 운영</h2>
        <p className="mt-3 text-base leading-7 text-foreground-secondary">
          FitBike는 에스와이아이가 운영합니다. 사업자등록번호, 통신판매업 신고번호 및 사업장
          정보는 모든 페이지 하단의 운영 정보에서 확인할 수 있습니다.
        </p>
      </section>

      <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link className="font-semibold text-primary hover:underline" href="/about">
          핏바이크 소개
        </Link>
        <Link className="font-semibold text-primary hover:underline" href="/privacy">
          개인정보처리방침
        </Link>
        <Link className="font-semibold text-primary hover:underline" href="/terms">
          이용약관
        </Link>
      </nav>
    </main>
  );
}
