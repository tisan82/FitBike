export function BatteryDetailLoading() {
  return (
    <div aria-live="polite" className="space-y-5" role="status">
      <div className="h-64 animate-pulse rounded-3xl bg-zinc-100" />
      <div className="h-72 animate-pulse rounded-3xl bg-zinc-100" />
    </div>
  );
}
