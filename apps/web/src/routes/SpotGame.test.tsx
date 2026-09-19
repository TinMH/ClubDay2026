// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotGame } from './SpotGame';
import { spotApi, type BoardState, type PickResult, type SpotBoard } from '../lib/api-spot';
import { ApiError } from '../lib/api';
import type { RoundState } from '../lib/types';

/**
 * Kiểm phần ĐIỀU KHIỂN của màn hình Ô khác màu: gửi gì lên server, và chặn được
 * những cú chạm không nên gửi.
 *
 * Thứ đáng canh nhất là CHẠM HAI NGÓN: hai ô chạm trong cùng một khung hình mà
 * cùng gửi đi thì cú thứ hai mang cấp cũ, server tính là chạm trượt, và người
 * chơi mất một cấp vì cú chạm họ không định làm.
 */

vi.mock('../lib/api-spot', () => ({
  spotApi: { board: vi.fn(), pick: vi.fn() },
}));

const boardMock = vi.mocked(spotApi.board);
const pickMock = vi.mocked(spotApi.pick);

const state: RoundState = {
  roundId: 'ABC123',
  game: 'spot',
  status: 'playing',
  serverNow: 0,
  startedAt: 0,
  endsAt: 45_000,
  maxPlayers: 5,
  players: [],
};

const board = (over: Partial<SpotBoard> = {}): SpotBoard => ({
  size: 2,
  base: 'hsl(200 65% 50%)',
  odd: 'hsl(200 65% 62%)',
  oddIndex: 3,
  ...over,
});

const boardState = (over: Partial<BoardState> = {}): BoardState => ({
  roundId: 'ABC123',
  status: 'playing',
  level: 1,
  board: board(),
  score: 0,
  correct: 0,
  wrong: 0,
  endsAt: 45_000,
  serverNow: 0,
  ...over,
});

const pickResult = (over: Partial<PickResult> = {}): PickResult => ({
  correct: true,
  score: 1,
  level: 2,
  board: board({ oddIndex: 1 }),
  correctCount: 1,
  wrongCount: 0,
  serverNow: 0,
  ...over,
});

const renderGame = () =>
  render(<SpotGame roundId="ABC123" playerId="p1" state={state} />);

const tiles = () => screen.getAllByRole('button', { name: /^Ô \d+$/ });
/** Ô thứ `i` (0-based) — ném lỗi rõ ràng thay vì `undefined` lặng lẽ. */
function tile(i: number): HTMLElement {
  const el = tiles()[i];
  if (!el) throw new Error(`Không có ô số ${i} trên bàn`);
  return el;
}

beforeEach(() => {
  boardMock.mockReset();
  pickMock.mockReset();
  boardMock.mockResolvedValue(boardState());
  pickMock.mockResolvedValue(pickResult());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SpotGame', () => {
  it('vẽ đủ size × size ô của bàn server gửi về', async () => {
    boardMock.mockResolvedValue(boardState({ board: board({ size: 4 }) }));
    renderGame();
    await waitFor(() => expect(tiles()).toHaveLength(16));
  });

  it('chạm ô nào thì gửi ĐÚNG ô đó kèm cấp hiện tại — không gửi đúng/sai', async () => {
    boardMock.mockResolvedValue(boardState({ level: 5 }));
    renderGame();
    await waitFor(() => expect(tiles()).toHaveLength(4));

    await act(async () => {
      fireEvent.pointerDown(tile(2));
    });

    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(1));
    expect(pickMock).toHaveBeenCalledWith('ABC123', 'p1', 5, 2);
  });

  it('chạm trúng → nhận bàn mới của cấp kế, không phải hỏi lại server', async () => {
    renderGame();
    await waitFor(() => expect(tiles()).toHaveLength(4));

    pickMock.mockResolvedValue(pickResult({ level: 3, board: board({ size: 3, oddIndex: 0 }) }));
    await act(async () => {
      fireEvent.pointerDown(tile(3));
    });

    await waitFor(() => expect(tiles()).toHaveLength(9));
    expect(boardMock).toHaveBeenCalledTimes(1); // chỉ lần nạp đầu
  });

  it('chạm hai ngón cùng lúc chỉ gửi MỘT lần', async () => {
    renderGame();
    await waitFor(() => expect(tiles()).toHaveLength(4));

    await act(async () => {
      fireEvent.pointerDown(tile(0));
      fireEvent.pointerDown(tile(1));
    });

    expect(pickMock).toHaveBeenCalledTimes(1);
  });

  it('chạm trượt → chỉ ra ô đúng một nhịp rồi mới về bàn cấp 1', async () => {
    vi.useFakeTimers();
    pickMock.mockResolvedValue(
      pickResult({ correct: false, score: 0, level: 1, board: board({ size: 2, oddIndex: 0 }) }),
    );
    renderGame();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      fireEvent.pointerDown(tile(0)); // ô đúng là số 3 (index 3)
      await vi.advanceTimersByTimeAsync(0);
    });

    // Ngay sau khi chấm: ô đúng của bàn VỪA CHƠI được đánh dấu.
    expect(tile(3).className).toMatch(/ring-correct/);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(tiles().some((t) => /ring-correct/.test(t.className))).toBe(false);
  });

  it('hết giờ → hiện màn kết, không gửi thêm gì', async () => {
    pickMock.mockRejectedValue(new ApiError('TIME_UP', 409));
    renderGame();
    await waitFor(() => expect(tiles()).toHaveLength(4));

    await act(async () => {
      fireEvent.pointerDown(tile(0));
    });

    await waitFor(() => expect(screen.getByText(/hết giờ/i)).toBeTruthy());
  });

  it('lệch cấp với server → hỏi lại bàn thay vì tự đoán', async () => {
    pickMock.mockRejectedValue(new ApiError('BAD_LEVEL', 400));
    renderGame();
    await waitFor(() => expect(tiles()).toHaveLength(4));

    await act(async () => {
      fireEvent.pointerDown(tile(0));
    });

    await waitFor(() => expect(boardMock).toHaveBeenCalledTimes(2));
  });

  it('bị chặn vì chạm quá nhanh → cũng hỏi lại bàn, và chơi tiếp được', async () => {
    pickMock.mockRejectedValueOnce(new ApiError('TOO_FAST', 429));
    renderGame();
    await waitFor(() => expect(tiles()).toHaveLength(4));

    await act(async () => {
      fireEvent.pointerDown(tile(0));
    });
    await waitFor(() => expect(boardMock).toHaveBeenCalledTimes(2));

    // Không được kẹt ở trạng thái "đang gửi" — cú chạm tiếp theo phải đi được.
    pickMock.mockResolvedValue(pickResult());
    await act(async () => {
      fireEvent.pointerDown(tile(1));
    });
    await waitFor(() => expect(pickMock).toHaveBeenCalledTimes(2));
  });
});
