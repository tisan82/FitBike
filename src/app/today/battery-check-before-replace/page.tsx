export const metadata = {
  title: "바이크 배터리 교체 전에 꼭 확인해야 할 5가지",
  description:
    "시동 문제? 바로 교체하지 마세요. 배터리 상태를 스스로 판단할 수 있는 체크리스트와 실제 사례를 제공합니다.",
};

export default function BatteryCheckPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 px-5 py-10">
      <article className="mx-auto max-w-3xl">

        {/* 제목 */}
        <h1 className="text-3xl font-bold">
          바이크 배터리 교체 전에 꼭 확인해야 할 5가지
        </h1>

        <p className="mt-4 text-zinc-600">
          시동이 안 걸리면 대부분 배터리를 의심합니다. 하지만 실제로는 다른
          원인인 경우도 많습니다. 아래 체크리스트로 먼저 판단해보세요.
        </p>

        {/* 🔥 자가 진단 UI */}
        <section className="mt-8 bg-zinc-100 p-5 rounded-xl">
          <h2 className="font-bold text-lg">빠른 자가 진단</h2>

          <ul className="mt-4 space-y-2">
            <li><input type="checkbox" /> 시동이 평소보다 느리다</li>
            <li><input type="checkbox" /> 계기판 불빛이 약하다</li>
            <li><input type="checkbox" /> 최근 장기간 운행 안 했다</li>
            <li><input type="checkbox" /> 배터리 사용 2년 이상</li>
            <li><input type="checkbox" /> 단자에 부식이 있다</li>
          </ul>

          <p className="mt-4 text-sm text-zinc-600">
            ✔ 2개 이상 해당되면 배터리 점검 또는 교체를 고려하세요
          </p>
        </section>

        {/* 이미지 영역 */}
        <section className="mt-10">
          <img
            src="https://images.unsplash.com/photo-1581093458791-9f3c4c66a9f6"
            alt="motorcycle battery"
            className="rounded-xl"
          />
          <p className="text-sm text-zinc-500 mt-2">
            배터리 상태는 외관과 전압 상태를 함께 확인해야 합니다
          </p>
        </section>

        {/* 기존 체크 설명 */}
        <section className="mt-10 space-y-6">
          <CheckItem
            title="시동이 느리게 걸린다"
            desc="전압이 부족할 가능성이 있지만 기온 영향도 있음"
          />
          <CheckItem
            title="계기판 불빛이 약하다"
            desc="전력 공급이 불안정한 상태"
          />
          <CheckItem
            title="장기간 운행 안 했다"
            desc="자연 방전 가능성 높음"
          />
          <CheckItem
            title="2년 이상 사용"
            desc="배터리 수명 도달 가능성"
          />
          <CheckItem
            title="단자 부식"
            desc="배터리 문제 아닌 접촉 문제일 수 있음"
          />
        </section>

        {/* 💡 CASE */}
        <section className="mt-12">
          <h2 className="text-xl font-bold">실제 사례</h2>

          <div className="mt-4 space-y-4">
            <CaseCard
              title="Case 1: 시동 불량 → 배터리 문제 아님"
              desc="단자 접촉 불량으로 시동이 안 걸린 경우"
            />
            <CaseCard
              title="Case 2: 겨울 방전 → 충전으로 해결"
              desc="배터리 교체 없이 복구 가능"
            />
            <CaseCard
              title="Case 3: 3년 사용 → 실제 교체 필요"
              desc="수명 종료로 교체"
            />
          </div>
        </section>

        {/* 🔥 결론 */}
        <section className="mt-12 border-t pt-6">
          <h2 className="text-xl font-bold">결론</h2>
          <p className="mt-3 text-zinc-700">
            배터리 문제는 단순 증상만으로 판단하면 오판 가능성이 높습니다.
            반드시 기준을 가지고 판단해야 합니다.
          </p>
        </section>

        {/* CTA */}
        <section className="mt-12 bg-blue-50 p-6 rounded-xl">
          <h3 className="font-bold text-lg">
            내 바이크에 맞는 배터리 확인하기
          </h3>
          <p className="text-sm mt-2 text-zinc-600">
            FitBike에서는 차량 기준으로 정확한 배터리 규격을 확인할 수 있습니다.
          </p>

          <a
            href="/bike-selector"
            className="inline-block mt-4 bg-blue-600 text-white px-5 py-3 rounded-lg"
          >
            내 바이크 선택 →
          </a>
        </section>
      </article>
    </main>
  );
}

type ContentCardProps = {
  title: string;
  desc: string;
};

function CheckItem({ title, desc }: ContentCardProps) {
  return (
    <div>
      <h3 className="font-bold">{title}</h3>
      <p className="text-zinc-600 text-sm">{desc}</p>
    </div>
  );
}

function CaseCard({ title, desc }: ContentCardProps) {
  return (
    <div className="bg-zinc-100 p-4 rounded-lg">
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-zinc-600">{desc}</p>
    </div>
  );
}