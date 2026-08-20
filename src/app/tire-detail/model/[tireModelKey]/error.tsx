"use client";

export default function TireModelDetailError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12 sm:py-16">
      <section className="max-w-xl rounded-2xl bg-surface-secondary p-6">
        <h1 className="text-xl font-bold text-foreground">타이어 모델 정보를 불러오지 못했습니다.</h1>
        <p className="mt-3 text-base leading-7 text-foreground-secondary">잠시 후 다시 시도해 주세요.</p>
        <button
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={reset}
          type="button"
        >
          다시 시도
        </button>
      </section>
    </main>
  );
}
