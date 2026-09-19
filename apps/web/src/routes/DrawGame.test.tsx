// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawGame } from './DrawGame';
import { drawApi, type FrameResult, type SubmitResult } from '../lib/api-draw';
import type { RoundState } from '../lib/types';

/**
 * Kiểm phần ĐIỀU KHIỂN của màn hình vẽ: nút NỘP BÀI, việc tự nộp khi hết giờ, và
 * việc gợi ý của AI KHÔNG được tự biến thành điểm.
 *
 * jsdom không có layout, không có pointer capture thật và không có canvas 2D —
 * nên bộ test này KHÔNG kiểm được hình vẽ ra sao, chỉ kiểm được cái gì gọi cái gì.
 * Hành vi thật trên điện thoại vẫn phải thử tay (xem mục "Track B xong khi").
 */

vi.mock('../lib/api-draw', () => ({
  drawApi: { frame: vi.fn(), submit: vi.fn() },
}));

const frameMock = vi.mocked(drawApi.frame);
const submitMock = vi.mocked(drawApi.submit);

/** Bản ghi các lệnh vẽ — canvas thật không có trong jsdom (thiếu gói `canvas`). */
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

beforeAll(() => {
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

  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = vi.fn(() => true);

  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };

  // Trả về ĐÚNG MỘT đối tượng: component gọi getContext() ở mỗi lần vẽ, nếu mỗi
  // lần một đối tượng mới thì không khẳng định được gì về các lệnh đã vẽ.
  const calls: string[] = [];
  const rec = (name: string) => () => {
    calls.push(name);
  };
  ctx = {
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
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ctx,
  ) as unknown as HTMLCanvasElement['getContext'];
});

const ROUND = 'ABC123';
const PLAYER = 'p1';

function makeState(over: Partial<RoundState> = {}): RoundState {
  const now = Date.now();
  return {
    roundId: ROUND,
    game: 'draw',
    status: 'playing',
    serverNow: now,
    startedAt: now,
    endsAt: now + 15_000,
    maxPlayers: 5,
    target: { id: 'circle', labelVi: 'hình tròn' },
    players: [{ id: PLAYER, name: 'An', score: 0, finished: false }],
    ...over,
  };
}

function frameOk(over: Partial<FrameResult> = {}): FrameResult {
  const now = Date.now();
  return { hint: false, top: [], score: 0, seconds: 1, endsAt: now + 15_000, serverNow: now, ...over };
}

function submitOk(over: Partial<SubmitResult> = {}): SubmitResult {
  const now = Date.now();
  return {
    committed: true,
    already: false,
    reason: 'button',
    matched: true,
    top: [],
    score: 143,
    seconds: 7,
    endsAt: now + 15_000,
    serverNow: now,
    ...over,
  };
}

function renderGame(state: RoundState = makeState()) {
  return render(<DrawGame roundId={ROUND} playerId={PLAYER} state={state} />);
}

/** Như `renderGame` nhưng BẮT BUỘC phải có canvas — dùng cho các test còn vẽ được. */
function setup(state: RoundState = makeState()) {
  const view = renderGame(state);
  const canvas = view.container.querySelector('canvas');
  if (!canvas) throw new Error('không thấy canvas');
  return { canvas, view };
}

/** Một nét ngắn, đủ xa nhau để bộ ghi không bỏ điểm nào. */
function drawStroke(canvas: Element): void {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1, buttons: 1 });
  fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60, pointerId: 1, buttons: 1 });
  fireEvent.pointerUp(canvas, { clientX: 60, clientY: 60, pointerId: 1 });
}

/** Nhãn nút đổi sang "Đang chấm…" ngay khi bấm, nên bắt cả hai. */
const submitButton = () =>
  screen.getByRole<HTMLButtonElement>('button', { name: /NỘP BÀI|Đang chấm/ });

beforeEach(() => {
  frameMock.mockReset();
  submitMock.mockReset();
  frameMock.mockResolvedValue(frameOk());
  submitMock.mockResolvedValue(submitOk());
  ctx.calls.length = 0;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('DrawGame — nút NỘP BÀI', () => {
  it('khoá khi canvas còn trắng, mở ra ngay sau nét vẽ đầu tiên', () => {
    const { canvas } = setup();
    expect(submitButton().disabled).toBe(true);

    drawStroke(canvas);

    expect(submitButton().disabled).toBe(false);
  });

  it('bấm nút → gửi NÉT VẼ lên server và hiện điểm server trả về', async () => {
    submitMock.mockResolvedValue(submitOk({ score: 143, seconds: 7 }));
    const { canvas } = setup();
    drawStroke(canvas);

    await act(async () => {
      fireEvent.click(submitButton());
    });

    expect(submitMock).toHaveBeenCalledTimes(1);
    const call = submitMock.mock.calls[0] ?? [];
    expect(call[0]).toBe(ROUND);
    expect(call[1]).toBe(PLAYER);
    expect(call[2]).toEqual([[[10, 10], [60, 60]]]);
    // Đúng ba tham số, không có tham số nào là điểm — client không được gửi điểm.
    expect(call).toHaveLength(3);

    await waitFor(() => expect(screen.getByText('143')).toBeTruthy());
    expect(screen.getByText(/AI đã nhận ra/)).toBeTruthy();
  });

  it('AI không nhận ra → 0 điểm, khoá bài, KHÔNG cho nộp lại', async () => {
    submitMock.mockResolvedValue(submitOk({ matched: false, score: 0, seconds: 15, reason: 'timeout' }));
    const { canvas } = setup();
    drawStroke(canvas);

    await act(async () => {
      fireEvent.click(submitButton());
    });

    await waitFor(() => expect(screen.getByText(/AI không nhận ra/)).toBeTruthy());
    expect(screen.getByText(/tự động nộp/)).toBeTruthy();
    // Bài chỉ chấm MỘT lần: hết bài thì không còn nút nào để bấm nữa.
    expect(screen.queryByRole('button', { name: /NỘP BÀI|Đang chấm/ })).toBeNull();
    expect(submitMock).toHaveBeenCalledTimes(1);
  });

  it('nộp lỗi (mạng, model) → vẫn còn quyền nộp lại', async () => {
    submitMock.mockRejectedValueOnce(new Error('boom'));
    const { canvas } = setup();
    drawStroke(canvas);

    await act(async () => {
      fireEvent.click(submitButton());
    });

    await waitFor(() => expect(screen.getByText(/Không nộp được bài/)).toBeTruthy());
    expect(submitButton().disabled).toBe(false);
  });

  it('bài đã nộp từ trước (tải lại trang) → hiện điểm, không hiện nút', () => {
    // Không dùng `setup()`: màn hình này không còn canvas để vẽ nữa.
    renderGame(
      makeState({
        players: [{ id: PLAYER, name: 'An', score: 138, finished: true }],
      }),
    );

    expect(screen.getByText('Bài đã nộp')).toBeTruthy();
    expect(screen.getByText('138')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /NỘP BÀI|Đang chấm/ })).toBeNull();
  });
});

describe('DrawGame — gợi ý của AI không phải là điểm', () => {
  it('AI đọc ra đúng từ khoá → chỉ hiện gợi ý, KHÔNG tự nộp bài', async () => {
    vi.useFakeTimers();
    frameMock.mockResolvedValue(
      frameOk({ hint: true, top: [{ label: 'circle', labelVi: 'hình tròn', score: 0.91 }] }),
    );
    const { canvas } = setup();
    drawStroke(canvas);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(screen.getByText(/AI đã nhận ra/)).toBeTruthy();
    // ⬅ Điểm chỉ sinh ra khi NỘP. Gợi ý đúng thì cũng không được tự gửi bài.
    expect(submitMock).not.toHaveBeenCalled();
  });
});

describe('DrawGame — nhịp gửi frame', () => {
  /**
   * Canh ĐÚNG lỗi đã xảy ra: bản cũ dùng `setInterval`, tức đếm nhịp từ lúc GỬI.
   * Mạng giật một nhịp là hai frame gửi đúng giờ vẫn tới server sát nhau, server
   * trả 429 TOO_FAST và người chơi mất một lượt nhận diện trong lượt vốn chỉ 15
   * giây. Nhịp phải đếm từ lúc frame trước XONG.
   */
  it('chờ frame trước xong rồi mới hẹn frame sau', async () => {
    vi.useFakeTimers();
    let settle: ((v: FrameResult) => void) | undefined;
    frameMock.mockImplementation(
      () =>
        new Promise<FrameResult>((resolve) => {
          settle = resolve;
        }),
    );

    const { canvas } = setup();
    drawStroke(canvas);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(frameMock).toHaveBeenCalledTimes(1);

    // Frame này đi mất 900ms mới về — đúng kiểu wifi hội trường.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(frameMock).toHaveBeenCalledTimes(1); // chưa xong thì chưa gửi tiếp

    await act(async () => {
      settle?.(frameOk());
      await vi.advanceTimersByTimeAsync(0);
    });

    // Tính từ lúc frame trước XONG, còn phải chờ đủ nhịp nữa. Bản cũ đã gửi
    // frame thứ hai ở đây rồi, và server thấy hai frame cách nhau có 100ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(frameMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(frameMock).toHaveBeenCalledTimes(2);
  });

  it('hết giờ thì thôi gửi frame — không bắn thêm request chỉ để nhận 409', async () => {
    vi.useFakeTimers();
    const { canvas } = setup(makeState({ endsAt: Date.now() + 500 }));
    drawStroke(canvas);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(frameMock).not.toHaveBeenCalled();
  });
});

describe('DrawGame — hết giờ thì TỰ NỘP', () => {
  it('đồng hồ chạm 0 → tự gửi bài, không cần bấm nút', async () => {
    vi.useFakeTimers();
    submitMock.mockResolvedValue(submitOk({ reason: 'timeout', score: 138, seconds: 12 }));
    const { canvas } = setup(makeState({ endsAt: Date.now() + 1_000 }));
    drawStroke(canvas);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_300);
    });

    expect(submitMock).toHaveBeenCalledTimes(1);
    // Nét vẽ cuối cùng vẫn được gửi kèm.
    expect(submitMock.mock.calls[0]?.[2]).toEqual([[[10, 10], [60, 60]]]);
    expect(screen.getByText(/tự động nộp/)).toBeTruthy();
    expect(screen.getByText('138')).toBeTruthy();
  });

  it('hết giờ mà canvas TRỐNG → không gửi nét nào, để server chấm bài nó đang giữ', async () => {
    vi.useFakeTimers();
    submitMock.mockResolvedValue(submitOk({ reason: 'timeout', matched: false, score: 0 }));
    setup(makeState({ endsAt: Date.now() + 1_000 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_300);
    });

    expect(submitMock).toHaveBeenCalledTimes(1);
    // Gửi `[]` ở đây là tự nộp một tờ giấy trắng: server đang giữ nét vẽ cuối nó
    // nhận được, và đó mới là bài của người chơi.
    expect(submitMock.mock.calls[0]?.[2]).toBeUndefined();
  });

  it('đã nộp tay rồi thì hết giờ KHÔNG nộp lại', async () => {
    vi.useFakeTimers();
    const { canvas } = setup(makeState({ endsAt: Date.now() + 1_000 }));
    drawStroke(canvas);

    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(submitMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_300);
    });

    expect(submitMock).toHaveBeenCalledTimes(1); // ⬅ vẫn đúng một lần
  });
});
