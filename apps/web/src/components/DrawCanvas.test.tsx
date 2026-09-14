// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawCanvas, type DrawCanvasHandle } from './DrawCanvas';
import { StrokeRecorder } from '../lib/strokes';

/**
 * Kiểm phần NỐI pointer event vào bộ ghi nét.
 *
 * jsdom không có layout, không có pointer capture thật và không có canvas 2D —
 * nên bộ test này KHÔNG kiểm được hình vẽ ra sao. Nó kiểm đúng thứ nó kiểm được:
 * sự kiện nào gọi hàm nào của bộ ghi, và việc vẽ có được thực hiện không.
 * Hành vi thật trên điện thoại vẫn phải thử tay (xem mục "Track B xong khi").
 */

/** Bản ghi các lệnh vẽ — để khẳng định "có vẽ thật", không chỉ "có gọi hàm". */
interface FakeCtx {
  calls: string[];
  setTransform: () => void;
  clearRect: () => void;
  beginPath: () => void;
  moveTo: () => void;
  lineTo: () => void;
  stroke: () => void;
  arc: () => void;
  fill: () => void;
  strokeStyle: string;
  fillStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
}

let ctx: FakeCtx;

function makeCtx(): FakeCtx {
  const calls: string[] = [];
  const rec = (name: string) => () => {
    calls.push(name);
  };
  return {
    calls,
    setTransform: rec('setTransform'),
    clearRect: rec('clearRect'),
    beginPath: rec('beginPath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    stroke: rec('stroke'),
    arc: rec('arc'),
    fill: rec('fill'),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  };
}

beforeAll(() => {
  // jsdom không có PointerEvent → tự dựng một bản tối thiểu.
  if (typeof window.PointerEvent === 'undefined') {
    class PE extends MouseEvent {
      pointerId: number;
      constructor(type: string, params: PointerEventInit = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 1;
      }
    }
    (window as unknown as { PointerEvent: unknown }).PointerEvent = PE;
  }

  // jsdom không cài đặt mấy hàm này — component BẮT BUỘC dùng chúng.
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => true);

  // jsdom không có ResizeObserver; component dùng để canh lại cỡ canvas.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };

  // jsdom không vẽ được canvas thật (thiếu gói `canvas`), nên thay bằng bản ghi.
  // Trả về ĐÚNG MỘT đối tượng: component gọi getContext() ở mỗi lần vẽ, nếu mỗi
  // lần trả một đối tượng mới thì không khẳng định được gì về các lệnh đã vẽ.
  ctx = makeCtx();
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ctx,
  ) as unknown as HTMLCanvasElement['getContext'];
});

beforeEach(() => {
  ctx.calls.length = 0;
});

function setup(disabled = false) {
  const recorder = new StrokeRecorder();
  const ref = createRef<DrawCanvasHandle>();
  const view = render(<DrawCanvas recorder={recorder} disabled={disabled} ref={ref} />);
  const canvas = view.container.querySelector('canvas');
  if (!canvas) throw new Error('không thấy canvas');
  return { recorder, ref, canvas, view };
}

const down = (el: Element, x: number, y: number) =>
  fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1, buttons: 1 });
const move = (el: Element, x: number, y: number) =>
  fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1, buttons: 1 });
const up = (el: Element, x: number, y: number) =>
  fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1 });

describe('DrawCanvas', () => {
  it('đặt tay xuống → mở nét mới và chấm một điểm', () => {
    const { recorder, canvas } = setup();

    down(canvas, 10, 20);

    expect(recorder.strokeCount).toBe(1);
    expect(recorder.payload()).toEqual([[[10, 20]]]);
    expect(ctx.calls).toContain('arc'); // có chấm thật lên màn hình
  });

  it('khi pointerdown thì GIỮ pointer — không có nó là mất nét khi kéo ra ngoài', () => {
    const { canvas } = setup();
    down(canvas, 10, 20);
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('khi pointerup thì nhả pointer', () => {
    const { canvas } = setup();
    down(canvas, 10, 20);
    up(canvas, 10, 20);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('kéo rê → nối tiếp nét và vẽ đoạn thẳng', () => {
    const { recorder, canvas } = setup();

    down(canvas, 10, 20);
    move(canvas, 60, 20);
    move(canvas, 110, 20);

    expect(recorder.strokeCount).toBe(1);
    expect(recorder.payload()).toEqual([[[10, 20], [60, 20], [110, 20]]]);
    expect(ctx.calls).toContain('stroke');
  });

  it('nhấc tay rồi rê tiếp thì KHÔNG nối vào nét cũ', () => {
    const { recorder, canvas } = setup();

    down(canvas, 10, 20);
    move(canvas, 60, 20);
    up(canvas, 60, 20);
    move(canvas, 200, 200); // rê ngoài lúc không đặt tay
    down(canvas, 30, 30);

    expect(recorder.strokeCount).toBe(2);
    expect(recorder.payload()).toEqual([[[10, 20], [60, 20]], [[30, 30]]]);
  });

  it('disabled thì không ghi nét nào', () => {
    const { recorder, canvas } = setup(true);

    down(canvas, 10, 20);
    move(canvas, 60, 20);
    up(canvas, 60, 20);

    expect(recorder.isEmpty).toBe(true);
  });

  it('đặt tay lần hai khi đang vẽ dở thì bị bỏ qua (không tạo nét rác)', () => {
    const { recorder, canvas } = setup();

    down(canvas, 10, 20);
    move(canvas, 60, 20);
    down(canvas, 999, 999); // ngón thứ hai chạm vào

    expect(recorder.strokeCount).toBe(1);
    expect(recorder.pointCount).toBe(2);
  });

  it('clear() xoá cả bộ ghi lẫn hình trên màn hình', () => {
    const { recorder, ref, canvas } = setup();

    down(canvas, 10, 20);
    move(canvas, 60, 20);
    up(canvas, 60, 20);
    expect(recorder.isEmpty).toBe(false);

    ctx.calls.length = 0;
    act(() => ref.current?.clear());

    expect(recorder.isEmpty).toBe(true);
    expect(ctx.calls).toContain('clearRect'); // màn hình cũng được xoá theo
  });
});
