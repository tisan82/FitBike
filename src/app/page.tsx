export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      {/* Hero */}
      <section className="px-5 pt-16 pb-12">
        <div className="mx-auto max-w-5xl">
          <p className="mb-4 text-sm font-semibold text-blue-400">
            FitBike Today
          </p>

          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            내 바이크 관리,
            <br />
            정비소 가기 전에 먼저 확인하세요.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
            배터리 방전, 타이어 마모, 오일 교체처럼 막연하게 불안한
            바이크 관리 문제를 먼저 체크하고 판단할 수 있도록 도와드립니다.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#checklist"
              className="rounded-xl bg-blue-500 px-6 py-4 text-center font-semibold text-white hover:bg-blue-400"
            >
              먼저 확인할 것 보기
            </a>

            <a
              href="/bike-selector"
              className="rounded-xl border border-zinc-700 px-6 py-4 text-center font-semibold text-zinc-100 hover:bg-zinc-900"
            >
              내 바이크 부품 확인하기
            </a>
          </div>
        </div>
      </section>

      {/* Core Value */}
      <section className="border-y border-zinc-800 bg-zinc-900/60 px-5 py-10">
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-zinc-900 p-6">
            <h2 className="text-lg font-bold">정비소 가기 전 확인</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              증상만 보고 바로 교체하지 말고, 먼저 확인해야 할 기준을
              정리합니다.
            </p>
          </div>

          <div className="rounded-2xl bg-zinc-900 p-6">
            <h2 className="text-lg font-bold">교체 필요 여부 판단</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              배터리, 타이어, 오일 상태를 체크리스트 기반으로 판단합니다.
            </p>
          </div>

          <div className="rounded-2xl bg-zinc-900 p-6">
            <h2 className="text-lg font-bold">내 바이크 기준 연결</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              일반 정보에서 끝나지 않고, 내 바이크에 맞는 규격 확인으로
              연결합니다.
            </p>
          </div>
        </div>
      </section>

      {/* Checklist */}
      <section id="checklist" className="px-5 py-14">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-bold">먼저 확인해야 할 관리 항목</h2>
          <p className="mt-4 text-zinc-400">
            FitBike Today는 교체 방법보다 “교체가 필요한지” 판단하는
            기준을 제공합니다.
          </p>

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <ArticleCard
              title="바이크 배터리 교체 전에 꼭 확인해야 할 5가지"
              description="시동이 약하거나 계기판 불빛이 흐릴 때, 바로 교체하기 전에 확인해야 할 기준입니다."
              tag="Battery"
            />

            <ArticleCard
              title="바이크 타이어 교체 시기, 마모선만 보면 충분할까?"
              description="마모선, 균열, 공기압, 제조일자까지 정비소 가기 전 확인할 항목을 정리합니다."
              tag="Tire"
            />

            <ArticleCard
              title="엔진오일 교체 전에 봐야 할 신호"
              description="주행거리뿐 아니라 색상, 점도, 냄새까지 함께 확인합니다."
              tag="Oil"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl rounded-3xl bg-blue-500 p-8 text-white sm:p-10">
          <h2 className="text-3xl font-bold">
            내 바이크에 맞는 부품 규격을 확인하세요
          </h2>

          <p className="mt-4 max-w-2xl leading-7 text-blue-50">
            FitBike는 차량 기준으로 배터리, 타이어, 오일 규격을 확인하고
            구매 가능한 상품까지 연결하는 서비스입니다.
          </p>

          <a
            href="/bike-selector"
            className="mt-8 inline-block rounded-xl bg-white px-6 py-4 font-bold text-blue-600 hover:bg-blue-50"
          >
            내 바이크 선택하기
          </a>
        </div>
      </section>
    </main>
  );
}

function ArticleCard({
  title,
  description,
  tag,
}: {
  title: string;
  description: string;
  tag: string;
}) {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <p className="mb-4 text-sm font-semibold text-blue-400">{tag}</p>
      <h3 className="text-xl font-bold leading-snug">{title}</h3>
      <p className="mt-4 text-sm leading-6 text-zinc-400">{description}</p>
      <button className="mt-6 text-sm font-semibold text-blue-400 hover:text-blue-300">
        곧 공개 예정 →
      </button>
    </article>
  );
}