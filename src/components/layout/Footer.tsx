export function Footer() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 px-5 py-6 text-zinc-400">
      <div className="mx-auto max-w-5xl text-sm">
        © {new Date().getFullYear()} FitBike
      </div>
    </footer>
  );
}
