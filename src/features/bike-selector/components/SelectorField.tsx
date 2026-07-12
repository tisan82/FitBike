import type { ChangeEvent, ReactNode } from "react";

type SelectorFieldProps = {
  id: string;
  label: string;
  value: number | null;
  disabled?: boolean;
  loading?: boolean;
  placeholder: string;
  emptyMessage: string;
  hasOptions: boolean;
  onChange: (value: number | null) => void;
  children: ReactNode;
};

export function SelectorField({
  id,
  label,
  value,
  disabled = false,
  loading = false,
  placeholder,
  emptyMessage,
  hasOptions,
  onChange,
  children,
}: SelectorFieldProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.target.value ? Number(event.target.value) : null);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-zinc-800" htmlFor={id}>
        {label}
      </label>
      <select
        className="min-h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none transition focus:border-zinc-900 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
        disabled={disabled || loading}
        id={id}
        onChange={handleChange}
        value={value ?? ""}
      >
        <option value="">
          {loading ? "불러오는 중..." : hasOptions ? placeholder : emptyMessage}
        </option>
        {children}
      </select>
    </div>
  );
}
