type Props = {
  message: string;
};

export function BatteryDetailError({ message }: Props) {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
      <h2 className="font-bold text-red-950">상품 정보를 불러오지 못했습니다.</h2>
      <p className="mt-2 text-sm leading-6 text-red-800">{message}</p>
    </section>
  );
}
