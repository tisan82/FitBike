export function TireDetailLoading() {
  return (
    <div aria-live="polite" className="space-y-5" role="status">
      <div className="h-64 animate-pulse rounded-3xl bg-zinc-100" />
      <div className="h-56 animate-pulse rounded-3xl bg-zinc-100" />
    </div>
  );
}
