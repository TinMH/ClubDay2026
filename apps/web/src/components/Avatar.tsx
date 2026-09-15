const TONES = [
  'bg-primary text-white',
  'bg-math text-ink',
  'bg-draw text-ink',
  'bg-accent text-ink',
  'bg-correct text-ink',
  'bg-secondary text-ink',
] as const;

/** Màu cố định theo id → cùng một người thì cùng một màu ở phòng chờ lẫn bảng hạng. */
function toneOf(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[h % TONES.length] ?? TONES[0];
}

/** Chữ cái đầu của TÊN (từ cuối cùng): "Nguyễn Minh Anh" → "A". */
export function initialOf(name: string): string {
  const last = name.normalize('NFC').trim().split(/\s+/).pop() ?? '';
  return (Array.from(last)[0] ?? '?').toLocaleUpperCase('vi');
}

/** Ô chữ cái đầu của người chơi. Trang trí thuần — tên đầy đủ luôn hiện ngay bên cạnh. */
export function Avatar({
  name,
  seed,
  size = 'md',
}: {
  name: string;
  seed: string;
  size?: 'md' | 'lg';
}) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-xl font-display font-extrabold ${toneOf(seed)} ${
        size === 'lg' ? 'h-14 w-14 text-2xl' : 'h-10 w-10 text-lg'
      }`}
    >
      {initialOf(name)}
    </span>
  );
}
