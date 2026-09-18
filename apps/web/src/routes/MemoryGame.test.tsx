// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryGame } from './MemoryGame';
import { memoryApi, type ReplayResult, type SequenceState } from '../lib/api-memory';
import { MEMORY_STEP_MS, type RoundState } from '../lib/types';

/**
 * Kiểm phần ĐIỀU KHIỂN của màn hình Nhớ nhanh: lúc nào được chạm, gửi gì lên
 * server, và nhịp phát lại có đúng hợp đồng thời gian với server hay không.
 *
 * Nhịp phát lại là thứ quan trọng nhất ở đây. Server chặn mọi lượt nộp đến sớm
 * hơn thời gian xem chuỗi; màn hình mà mở cho chạm trước khi nháy xong thì người
 * chơi THẬT bị chặn vì nghi gian lận. Có test canh để nó không xảy ra.
 */

vi.mock('../lib/api-memory', () => ({
  memoryApi: { sequence: vi.fn(), replay: vi.fn() },
}));

const sequenceMock = vi.mocked(memoryApi.sequence);
const replayMock = vi.mocked(memoryApi.replay);

const state: RoundState = {
  roundId: 'ABC123',
  game: 'memory',
  status: 'playing',
  serverNow: 0,
  startedAt: 0,
  endsAt: 60_000,
  players: [],
};

function seqState(over: Partial<SequenceState> = {}): SequenceState {
  return {
    roundId: 'ABC123',
    status: 'playing',
    level: 2,
    sequence: [1, 3],
    pads: 4,
    stepMs: MEMORY_STEP_MS,
    score: 1,
    correct: 1,
    wrong: 0,
    endsAt: 60_000,
    serverNow: 0,
    ...over,
  };
}

function replayResult(over: Partial<ReplayResult> = {}): ReplayResult {
  return {
    correct: true,
    score: 2,
    level: 3,
    sequence: [1, 3, 0],
    correctCount: 2,
    wrongCount: 0,
    serverNow: 0,
    ...over,
  };
}

const pad = (i: number) => screen.getByLabelText(new RegExp(`^Ô ${i}:`));

/** Chờ nháy xong chuỗi rồi mới tới lượt chạm. */
async function playbackDone(length: number) {
  await act(async () => {
    vi.advanceTimersByTime(length * MEMORY_STEP_MS);
  });
}

async function mount() {
  render(<MemoryGame roundId="ABC123" playerId="p1" state={state} />);
  await waitFor(() => expect(sequenceMock).toHaveBeenCalled());
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  sequenceMock.mockReset().mockResolvedValue(seqState());
  replayMock.mockReset().mockResolvedValue(replayResult());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MemoryGame', () => {
  it('đang phát chuỗi thì KHÔNG cho chạm', async () => {
    await mount();
    await act(async () => {
      vi.advanceTimersByTime(MEMORY_STEP_MS / 2);
    });

    expect(pad(1)).toHaveProperty('disabled', true);
    fireEvent.pointerDown(pad(1));
    expect(replayMock).not.toHaveBeenCalled();
  });

  /**
   * Chốt hợp đồng với server: phát lại 2 ô phải mất ĐỦ 2 × MEMORY_STEP_MS.
   * Mở sớm hơn là người chơi thật bị server gắn cờ gian lận.
   */
  it('chỉ mở cho chạm SAU khi nháy xong toàn bộ chuỗi', async () => {
    await mount();
    // Sát mốc nhưng CHƯA tới: ô thứ hai còn đang nháy.
    // Biên 150ms vì `shouldAdvanceTime` cho đồng hồ thật chạy xen vào — đo sát
    // hơn thì test chớp tắt theo tốc độ máy chạy CI, không theo code.
    await act(async () => {
      vi.advanceTimersByTime(2 * MEMORY_STEP_MS - 150);
    });
    expect(pad(1)).toHaveProperty('disabled', true);

    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(pad(1)).toHaveProperty('disabled', false);
  });

  it('gửi đúng các ô đã bấm khi đủ độ dài cấp — và không gửi điểm', async () => {
    await mount();
    await playbackDone(2);

    fireEvent.pointerDown(pad(2)); // ô index 1
    expect(replayMock).not.toHaveBeenCalled(); // mới 1/2 ô

    await act(async () => {
      fireEvent.pointerDown(pad(4)); // ô index 3
    });

    await waitFor(() => expect(replayMock).toHaveBeenCalledTimes(1));
    expect(replayMock.mock.calls[0]).toEqual(['ABC123', 'p1', 2, [1, 3]]);
  });

  it('lặp sai → báo làm lại từ cấp 1', async () => {
    replayMock.mockResolvedValue(replayResult({ correct: false, score: 1, level: 1, sequence: [1] }));
    await mount();
    await playbackDone(2);

    await act(async () => {
      fireEvent.pointerDown(pad(1));
      fireEvent.pointerDown(pad(1));
    });

    await waitFor(() => expect(screen.getByText(/Làm lại từ cấp 1/)).toBeTruthy());
  });

  it('hết giờ giữa chừng → hiện kết quả, không báo lỗi', async () => {
    const { ApiError } = await import('../lib/api');
    replayMock.mockRejectedValue(new ApiError('TIME_UP', 409));
    await mount();
    await playbackDone(2);

    await act(async () => {
      fireEvent.pointerDown(pad(1));
      fireEvent.pointerDown(pad(1));
    });

    await waitFor(() => expect(screen.getByText(/Hết giờ!/)).toBeTruthy());
  });

  /** Lệch cấp là chuyện của mạng, không phải của người chơi → hỏi lại server. */
  it('server báo lệch cấp → tải lại chuỗi thay vì báo lỗi', async () => {
    const { ApiError } = await import('../lib/api');
    replayMock.mockRejectedValue(new ApiError('BAD_LEVEL', 400));
    await mount();
    await playbackDone(2);

    await act(async () => {
      fireEvent.pointerDown(pad(1));
      fireEvent.pointerDown(pad(1));
    });

    await waitFor(() => expect(sequenceMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
