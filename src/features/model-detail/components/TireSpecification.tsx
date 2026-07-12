import type { TireSpecification as TireSpecificationType } from "@/features/model-detail/types/model-detail.types";

type Props = {
  front: TireSpecificationType;
  rear: TireSpecificationType;
};

function formatSpecification(spec: TireSpecificationType) {
  if (spec.fullSize) return spec.fullSize;
  if (spec.width === null || spec.diameter === null) return "규격 정보 없음";

  const ratio = spec.ratio === null ? "" : `/${spec.ratio}`;
  return `${spec.width}${ratio}-${spec.diameter}`;
}

function TireCard({ title, spec }: { title: string; spec: TireSpecificationType }) {
  return (
    <article className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
      <p className="text-sm font-semibold text-zinc-500">{title}</p>
      <p className="mt-2 text-xl font-bold text-zinc-950">{formatSpecification(spec)}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
        {spec.loadIndex !== null ? <span>하중 {spec.loadIndex}</span> : null}
        {spec.speedIndex ? <span>속도 {spec.speedIndex}</span> : null}
        {spec.tubeType ? <span>{spec.tubeType}</span> : null}
      </div>
    </article>
  );
}

export function TireSpecification({ front, rear }: Props) {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-sm font-semibold text-zinc-500">TIRE SPECIFICATION</p>
        <h2 className="mt-1 text-xl font-bold text-zinc-950">순정 타이어 규격</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TireCard title="앞 타이어" spec={front} />
        <TireCard title="뒤 타이어" spec={rear} />
      </div>
    </section>
  );
}
