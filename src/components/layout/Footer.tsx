export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-secondary px-5 py-6 text-foreground-secondary">
      <div className="mx-auto max-w-5xl text-sm">
        © {new Date().getFullYear()} FitBike
      </div>
    </footer>
  );
}
