type Props = {
  modelName: string;
};

export function FitmentResultEmpty({ modelName }: Props) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-7 text-center">
      <h2 className="font-bold text-zinc-950">등록된 타이어 상품이 없습니다.</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        {modelName}의 순정 규격은 확인할 수 있지만 연결된 상품은 아직 준비 중입니다.
      </p>
    </div>
  );
}
