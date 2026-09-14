import {
  useEffect,
  useImperativeHandle,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { StrokeRecorder } from '../lib/strokes';

/**
 * TRACK B — vùng vẽ.
 *
 * Component này chỉ lo ĐÚNG hai việc: vẽ nét lên màn hình và ghi nét vào
 * `StrokeRecorder`. Nó không biết gì về server, không tự gửi gì cả —
 * `DrawGame` mới là chỗ gửi frame.
 *
 * Bộ ghi nét được TRUYỀN TỪ NGOÀI vào để `DrawGame` đọc được nét bất cứ lúc nào
 * mà không cần component này lộ nội bộ ra.
 */

const PEN_WIDTH = 3;
const PEN_COLOR = '#eef2ff';

export interface DrawCanvasHandle {
  /** Xoá cả nét đã ghi lẫn hình trên màn hình. */
  clear(): void;
}

interface Props {
  recorder: StrokeRecorder;
  disabled?: boolean;
  ref?: Ref<DrawCanvasHandle>;
}

export function DrawCanvas({ recorder, disabled = false, ref }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Điểm cuối cùng đã vẽ TRÊN MÀN HÌNH — khác điểm cuối trong recorder. */
  const penRef = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);
  const dprRef = useRef(1);

  /** Vẽ lại từ đầu theo dữ liệu trong recorder (dùng khi canvas bị đổi kích thước). */
  function repaint(): void {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = PEN_COLOR;
    ctx.fillStyle = PEN_COLOR;
    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Vẽ lại từ payload (toạ độ đã làm tròn) — nét trên màn hình luôn khớp với
    // nét sẽ gửi lên server, không phải một phiên bản "đẹp hơn" của nó.
    for (const stroke of recorder.payload()) {
      if (stroke.length === 1) {
        const [x, y] = stroke[0] as [number, number];
        ctx.beginPath();
        ctx.arc(x, y, PEN_WIDTH / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      stroke.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x as number, y as number);
        else ctx.lineTo(x as number, y as number);
      });
      ctx.stroke();
    }
  }

  useImperativeHandle(ref, () => ({
    clear() {
      recorder.clear();
      penRef.current = null;
      repaint();
    },
  }));

  // Cỡ backing store phải theo devicePixelRatio, nếu không nét bị nhoè trên máy
  // có màn hình mật độ cao. `setTransform` giữ toạ độ vẽ theo px CSS.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fit = (): void => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width === w && canvas.height === h && dprRef.current === dpr) return;

      dprRef.current = dpr;
      canvas.width = w;
      canvas.height = h;
      repaint(); // đổi cỡ là canvas tự xoá → phải vẽ lại
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  function pointAt(e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function drawSegment(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = PEN_COLOR;
    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function drawDot(at: { x: number; y: number }): void {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = PEN_COLOR;
    ctx.beginPath();
    ctx.arc(at.x, at.y, PEN_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (disabled || activeRef.current) return;

    // BẮT BUỘC. Không có nó, người chơi kéo ra ngoài canvas — chuyện xảy ra liên
    // tục ở mép màn hình điện thoại — là mất nét giữa chừng, rồi nét sau nối
    // thẳng từ điểm cũ tới điểm mới và hình bị méo hẳn.
    e.currentTarget.setPointerCapture(e.pointerId);

    const p = pointAt(e);
    activeRef.current = true;
    recorder.begin(p.x, p.y);
    penRef.current = p;
    drawDot(p);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!activeRef.current) return;
    const p = pointAt(e);

    // Bộ ghi tự bỏ điểm quá gần; màn hình thì vẫn vẽ cho mượt tay.
    recorder.extend(p.x, p.y);

    const prev = penRef.current;
    if (prev) drawSegment(prev, p);
    penRef.current = p;
  }

  function onPointerUp(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    recorder.end();
    penRef.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      className={`draw-canvas h-full w-full rounded-xl bg-ink-soft ${
        disabled ? 'opacity-60' : 'cursor-crosshair'
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ height: '100%', width: '100%' }}
    />
  );
}
