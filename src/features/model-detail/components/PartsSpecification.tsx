import type { ModelDetailData } from "@/features/model-detail/types/model-detail.types";

type Props = {
  model: ModelDetailData;
};

function Value({ children }: { children: string | null }) {
  return <p className="mt-2 font-semibold text-zinc-950">{children ?? "정보 없음"}</p>;
}

export function PartsSpecification({ model }: Props) {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-sm font-semibold text-zinc-500">PARTS SPECIFICATION</p>
        <h2 className="mt-1 text-xl font-bold text-zinc-950">배터리·브레이크 규격</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl bg-zinc-50 p-5">
          <p className="text-sm text-zinc-500">배터리</p>
          <Value>{model.batteryStandardCode}</Value>
          {model.batteryVoltage ? <p className="mt-1 text-sm text-zinc-600">{model.batteryVoltage}</p> : null}
        </article>
        <article className="rounded-xl bg-zinc-50 p-5">
          <p className="text-sm text-zinc-500">앞 브레이크</p>
          <Value>{model.frontBrakeSpec}</Value>
          {model.frontBrakeCaliperType ? <p className="mt-1 text-sm text-zinc-600">{model.frontBrakeCaliperType}</p> : null}
        </article>
        <article className="rounded-xl bg-zinc-50 p-5">
          <p className="text-sm text-zinc-500">뒤 브레이크</p>
          <Value>{model.rearBrakeSpec}</Value>
          {model.rearBrakeCaliperType ? <p className="mt-1 text-sm text-zinc-600">{model.rearBrakeCaliperType}</p> : null}
        </article>
      </div>
    </section>
  );
}
