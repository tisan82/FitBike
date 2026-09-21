import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "문의하기",
  description: "핏바이크 서비스, 정보 오류, 콘텐츠, 개인정보 및 제휴 관련 문의 안내입니다.",
  alternates: { canonical: "/contact" },
};

const categories = [
  ["모델·연식 정보", "등록된 바이크의 모델명, 연식 또는 사양 정보가 실제 차량과 다른 경우"],
  ["부품 규격 정보", "타이어·배터리·브레이크 등 부품 규격의 오류나 수정이 필요한 경우"],
  ["콘텐츠", "점검·관리 콘텐츠의 내용에 대한 의견이나 정정 요청"],
  ["개인정보", "개인정보 처리와 관련한 열람·정정·삭제 등 문의"],
  ["제휴·기타", "서비스 제휴, 자료 제공 또는 그 밖의 운영 관련 문의"],
] as const;

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">CONTACT</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">문의하기</h1>
        <p className="mt-5 text-base leading-7 text-foreground-secondary">핏바이크의 모델·연식, 부품 규격, 콘텐츠 오류를 발견했거나 서비스 이용 중 문의할 내용이 있다면 알려주세요.</p>
      </header>

      <section className="mt-10 rounded-xl border border-border bg-surface p-6 sm:p-7">
        <h2 className="text-xl font-bold text-foreground">문의처</h2>
        <dl className="mt-5 grid gap-4 text-base sm:grid-cols-[120px_1fr]">
          <dt className="font-medium text-foreground-secondary">이메일</dt>
          <dd><a className="font-semibold text-primary hover:underline" href="mailto:changsoo_j@naver.com">changsoo_j@naver.com</a></dd>
          <dt className="font-medium text-foreground-secondary">고객센터</dt>
          <dd><a className="font-semibold text-primary hover:underline" href="tel:01026400761">010-2640-0761</a></dd>
          <dt className="font-medium text-foreground-secondary">운영</dt>
          <dd className="text-foreground">에스와이아이 · 대표 전창수</dd>
        </dl>
        <p className="mt-5 text-sm leading-6 text-foreground-secondary">문의 시 확인이 필요한 모델명·연식·페이지 주소와 오류 내용을 함께 보내주시면 내용을 확인하는 데 도움이 됩니다.</p>
      </section>

      <section className="mt-12 border-t border-border pt-9">
        <h2 className="text-xl font-bold text-foreground">문의 유형</h2>
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
        <h2 className="text-xl font-bold text-foreground">사업자 정보</h2>
        <p className="mt-4 text-base leading-7 text-foreground-secondary">에스와이아이 · 대표 전창수 · 사업자등록번호 576-61-00395 · 통신판매업 신고번호 2021-서울양천-0220</p>
        <p className="mt-2 text-base leading-7 text-foreground-secondary">서울특별시 영등포구 영중로 96, 2층 1호 (07246)</p>
      </section>

      <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
        <Link className="font-semibold text-primary hover:underline" href="/about">핏바이크 소개</Link>
        <Link className="font-semibold text-primary hover:underline" href="/privacy">개인정보처리방침</Link>
        <Link className="font-semibold text-primary hover:underline" href="/terms">이용약관</Link>
      </nav>
    </main>
  );
}
