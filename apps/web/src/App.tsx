const GAMES = [
  { name: 'Tính nhanh', desc: '90 giây · trả lời phép toán' },
  { name: 'Vẽ hình nhanh', desc: '15 giây · AI nhận diện' },
];

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-5 py-10">
      <header>
        <h1 className="text-4xl font-bold tracking-tight">ClubDay</h1>
        <p className="mt-2 text-muted">
          Web 2 trò chơi cho sự kiện CLB. Mỗi lượt tối đa 5 người.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {GAMES.map((g) => (
          <section
            key={g.name}
            className="rounded-xl border border-white/10 bg-ink-soft p-4"
          >
            <h2 className="font-semibold">{g.name}</h2>
            <p className="mt-1 text-sm text-muted">{g.desc}</p>
          </section>
        ))}
      </div>

      <footer className="text-sm text-muted">
        Khung dự án đã sẵn sàng — game sẽ được thêm ở Phase 1–4.{' '}
        <a
          href="/api/health"
          className="text-brand underline-offset-4 hover:underline"
        >
          /api/health
        </a>
      </footer>
    </main>
  );
}
