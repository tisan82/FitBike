import Link from "next/link";

type Props = {
  message: string;
};

export function ModelDetailError({ message }: Props) {
  return (
    <div className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-6">
      <p className="font-semibold text-red-900">{message}</p>
      <Link className="inline-flex text-sm font-semibold text-red-800 underline" href="/bike-selector">
        바이크 다시 선택하기
      </Link>
    </div>
  );
}
