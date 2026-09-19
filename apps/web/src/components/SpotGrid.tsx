import type { SpotBoard } from '../lib/api-spot';

export interface SpotGridProps {
  board: SpotBoard;
  disabled: boolean;
  /** Ô người chơi vừa chạm — viền sáng ngay, không chờ server. */
  pressed: number | null;
  /** Chạm trượt: chỉ ô này được lộ ra là ô đúng, để người chơi học được mắt mình sai ở đâu. */
  reveal: number | null;
  onTap: (index: number) => void;
}

/**
 * Lưới `size × size` ô cùng màu, đúng một ô lệch độ sáng.
 *
 * Màu đặt thẳng bằng inline style chứ không qua class: hai màu là do server sinh
 * theo cấp (HSL bất kỳ), không phải một bảng màu cố định mà Tailwind quét ra được.
 *
 * Lưới luôn VUÔNG và co theo bề ngang màn hình, nên ở cấp 9 (6×6) mỗi ô vẫn còn
 * khoảng 50px — vừa đầu ngón tay. Khe hở giữa các ô hẹp lại khi lưới dày thêm,
 * vì hai mảng màu càng gần nhau thì mắt càng dễ so.
 */
export function SpotGrid({ board, disabled, pressed, reveal, onTap }: SpotGridProps) {
  const { size, base, odd, oddIndex } = board;
  const tiles = Array.from({ length: size * size }, (_, i) => i);

  return (
    <div
      role="group"
      aria-label={`Lưới ${size} nhân ${size} — tìm ô khác màu`}
      className="mx-auto grid aspect-square w-full max-w-md"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        gap: size >= 5 ? '0.3rem' : '0.5rem',
      }}
    >
      {tiles.map((i) => (
        <button
          key={i}
          type="button"
          onPointerDown={() => !disabled && onTap(i)}
          disabled={disabled}
          aria-label={`Ô ${i + 1}`}
          style={{ backgroundColor: i === oddIndex ? odd : base }}
          className={`h-full w-full rounded-lg transition-transform duration-100 ${
            pressed === i ? 'scale-95' : ''
          } ${
            reveal === i ? 'ring-4 ring-correct ring-offset-2 ring-offset-ink' : ''
          } ${disabled ? 'cursor-default' : ''}`}
        />
      ))}
    </div>
  );
}
