import Link from "next/link";

type Props = {
  message: string;
};

export function FitmentResultError({ message }: Props) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
      <h2 className="font-bold">정보를 불러오지 못했습니다.</h2>
      <p className="mt-2 text-sm">{message}</p>
      <Link className="mt-4 inline-flex font-semibold underline" href="/bike-selector">
        바이크 다시 선택하기
      </Link>
    </div>
  );
}
