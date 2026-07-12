type BikeSelectorSubmitProps = { disabled: boolean };

export function BikeSelectorSubmit({ disabled }: BikeSelectorSubmitProps) {
  return (
    <button className="min-h-12 w-full rounded-xl bg-zinc-900 px-5 text-base font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300" disabled={disabled} type="submit">
      장착 가능 상품 보기
    </button>
  );
}
