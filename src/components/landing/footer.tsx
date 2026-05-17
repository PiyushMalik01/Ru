export function Footer() {
  return (
    <footer className="border-t px-6 py-10 md:px-12" style={{ background: "#faf8f5", borderColor: "#e8e4de" }}>
      <div className="mx-auto flex max-w-5xl items-start justify-between">
        <div>
          <span className="text-xl font-bold" style={{ fontFamily: "var(--font-serif)", color: "#2d2a26" }}>Ru</span>
          <p className="mt-1 text-xs" style={{ color: "#b5afa5" }}>The AI life organizer</p>
        </div>
        <div className="flex items-center gap-6">
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-sm font-medium transition-colors hover:underline" style={{ color: "#8a847b" }}>
            Twitter
          </a>
          <a href="https://github.com/PiyushMalik01/Ru" target="_blank" rel="noopener noreferrer" className="text-sm font-medium transition-colors hover:underline" style={{ color: "#8a847b" }}>
            GitHub
          </a>
        </div>
      </div>
      <div className="mx-auto mt-8 max-w-5xl border-t pt-6 text-center" style={{ borderColor: "#e8e4de" }}>
        <span className="text-xs" style={{ color: "#b5afa5" }}>&copy; 2026 Ru. All rights reserved.</span>
      </div>
    </footer>
  );
}
