import Link from "next/link";

export function TireDetailInvalid() {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <h2 className="font-bold text-amber-950">잘못된 상품 주소입니다.</h2>
      <p className="mt-2 text-sm leading-6 text-amber-800">
        올바른 타이어 상품을 다시 선택해 주세요.
      </p>
      <Link
        className="mt-5 inline-flex rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white"
        href="/bike-selector"
      >
        바이크 선택으로 이동
      </Link>
    </section>
  );
}
