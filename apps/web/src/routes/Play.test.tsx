// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Play } from './Play';
import { api } from '../lib/api';
import { saveSession } from '../lib/session';
import type { RoundState } from '../lib/types';

/**
 * Canh ĐÚNG lỗi đã xảy ra: màn hình game từng được gọi như hàm thường
 * (`SCREENS[game](props)`) thay vì render bằng JSX. Gọi như thế thì game không
 * có fiber riêng — hook của nó nối thẳng vào danh sách hook của `Play`, mà
 * `Play` lại có nhánh thoát sớm (lượt còn ở phòng chờ). Đúng lúc lượt chuyển
 * sang "đang chơi", số hook tăng vọt và React ném #310 "Rendered more hooks
 * than during the previous render" — người chơi thấy trắng màn hình ngay giây
 * đầu của lượt, tức là hỏng đúng lúc không được phép hỏng.
 *
 * Test này đi đúng đường đó: vào lúc còn 'lobby' rồi để SSE đẩy sang 'playing'.
 */

/** Hàm nhận state của SSE — giữ lại để test tự đẩy trạng thái mới vào. */
let pushState: ((s: RoundState) => void) | null = null;

vi.mock('../lib/sse', () => ({
  useRoundStream: (_roundId: string | undefined, onState: (s: RoundState) => void) => {
    pushState = onState;
    return true;
  },
}));

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: { ...actual.api, state: vi.fn() } };
});

const stateMock = vi.mocked(api.state);

const roundState = (over: Partial<RoundState> = {}): RoundState => ({
  roundId: 'ABC123',
  game: 'math',
  status: 'lobby',
  serverNow: 0,
  startedAt: null,
  endsAt: null,
  players: [{ id: 'p1', name: 'An', score: 0, finished: false }],
  ...over,
});

const renderPlay = () =>
  render(
    <MemoryRouter initialEntries={['/play/ABC123']}>
      <Routes>
        <Route path="/play/:roundId" element={<Play />} />
        <Route path="/dashboard/:roundId" element={<p>bảng hạng</p>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  localStorage.clear();
  pushState = null;
  stateMock.mockReset();
  stateMock.mockResolvedValue(roundState());
  saveSession({ playerId: 'p1', roundId: 'ABC123', game: 'math', name: 'An' });
});

afterEach(() => cleanup());

describe('Play — chuyển từ phòng chờ sang đang chơi', () => {
  it('không vỡ khi lượt bắt đầu (màn hình game phải có fiber riêng)', async () => {
    renderPlay();
    await waitFor(() => expect(screen.getByText(/lượt chưa bắt đầu/i)).toBeTruthy());

    // Lượt bắt đầu — đây là lúc số hook từng nhảy và React ném #310.
    await act(async () => {
      pushState?.(roundState({ status: 'playing', startedAt: 0, endsAt: 90_000 }));
    });

    expect(screen.queryByText(/lượt chưa bắt đầu/i)).toBeNull();
  });

  it('cũng không vỡ khi người xem chưa tham gia lượt rồi mới vào', async () => {
    // Không có phiên khớp lượt này → Play vẽ nhánh cảnh báo, chưa render game.
    localStorage.clear();
    stateMock.mockResolvedValue(roundState({ status: 'playing', startedAt: 0, endsAt: 90_000 }));
    renderPlay();
    await waitFor(() => expect(screen.getByText(/chưa tham gia lượt này/i)).toBeTruthy());

    await act(async () => {
      saveSession({ playerId: 'p1', roundId: 'ABC123', game: 'math', name: 'An' });
      pushState?.(roundState({ status: 'playing', startedAt: 0, endsAt: 90_001 }));
    });

    expect(screen.queryByText(/chưa tham gia lượt này/i)).toBeNull();
  });
});
