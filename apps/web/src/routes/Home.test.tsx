// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home';
import { api } from '../lib/api';
import { GAME_KINDS } from '../lib/types';

/**
 * Luật của trang chủ: NGƯỜI CHƠI KHÔNG CHỌN TRÒ.
 *
 * Mỗi thời điểm cả booth chơi đúng một trò, do BTC bấm ở /admin; trang chủ chỉ
 * hiển thị lại quyết định đó. Bộ test này bám vào hai thứ chứng minh được:
 *   1. lệnh `join` KHÔNG bao giờ kèm `game` — server là nơi quyết;
 *   2. BTC đang đóng thì không vào được, và màn hình nói rõ vì sao.
 *
 * (Trước đây trang này từng có bộ chọn trò cho người chơi. Đổi luật thì đổi luôn
 * test, chứ không giữ lại hai hợp đồng mâu thuẫn nhau.)
 */

vi.mock('../lib/api', () => ({
  api: { join: vi.fn(), openRounds: vi.fn(), config: vi.fn() },
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      readonly status: number,
    ) {
      super(code);
    }
  },
}));

const joinMock = vi.mocked(api.join);
const openMock = vi.mocked(api.openRounds);
const configMock = vi.mocked(api.config);

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/r/:code" element={<Home />} />
        <Route path="/lobby/:roundId" element={<p>phòng chờ</p>} />
      </Routes>
    </MemoryRouter>,
  );

const nameField = () => screen.getByLabelText(/tên của bạn/i);
const joinButton = () => screen.getByRole('button', { name: /vào chơi/i }) as HTMLButtonElement;

beforeEach(() => {
  localStorage.clear();
  joinMock.mockReset();
  openMock.mockReset();
  configMock.mockReset();
  configMock.mockResolvedValue({ signupFormUrl: '', signupNameEntry: '', activeGame: 'draw' });
  openMock.mockResolvedValue({ open: { math: null, draw: null, memory: null, spot: null }, max: 5 });
  joinMock.mockResolvedValue({
    playerId: 'p1',
    roundId: 'ABC123',
    game: 'draw',
    state: {
      roundId: 'ABC123',
      game: 'draw',
      status: 'lobby',
      serverNow: 0,
      startedAt: null,
      endsAt: null,
      players: [],
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('Home — trò do BTC chọn', () => {
  it('không có ô chọn trò nào cho người chơi', async () => {
    renderAt('/');
    await waitFor(() => expect(configMock).toHaveBeenCalled());
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('join KHÔNG gửi `game` — server quyết theo trò đang mở', async () => {
    renderAt('/');
    await waitFor(() => expect(configMock).toHaveBeenCalled());

    fireEvent.change(nameField(), { target: { value: 'Minh' } });
    await act(async () => {
      fireEvent.click(joinButton());
    });

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock.mock.calls[0]?.[0]).toBe('Minh');
    expect(joinMock.mock.calls[0]?.[1]).toEqual({});
  });

  it('chỉ trò đang mở được đánh dấu, các trò khác nói rõ "chưa tới lượt"', async () => {
    renderAt('/');

    await waitFor(() =>
      expect(screen.getAllByText(/chưa tới lượt/)).toHaveLength(GAME_KINDS.length - 1),
    );
  });

  it('BTC đang đóng thì không vào được, và có nói vì sao', async () => {
    configMock.mockResolvedValue({ signupFormUrl: '', signupNameEntry: '', activeGame: null });
    renderAt('/');

    fireEvent.change(nameField(), { target: { value: 'Minh' } });
    await waitFor(() => expect(screen.getByText(/chưa mở trò nào/i)).toBeTruthy());
    expect(joinButton().disabled).toBe(true);

    await act(async () => {
      fireEvent.click(joinButton());
    });
    expect(joinMock).not.toHaveBeenCalled();
  });

  it('thiếu tên thì nút vẫn mờ', async () => {
    renderAt('/');
    await waitFor(() => expect(configMock).toHaveBeenCalled());

    expect(joinButton().disabled).toBe(true);
    fireEvent.change(nameField(), { target: { value: 'Minh' } });
    expect(joinButton().disabled).toBe(false);
  });

  it('vào bằng /r/<mã>: chỉ gửi roundId, không gửi game', async () => {
    renderAt('/r/abc123');

    fireEvent.change(nameField(), { target: { value: 'Minh' } });
    await act(async () => {
      fireEvent.click(joinButton());
    });

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock.mock.calls[0]?.[1]).toEqual({ roundId: 'ABC123' });
  });
});

describe('Home — tình hình lượt đang chờ', () => {
  it('hiện số người đang chờ và số còn thiếu, để người mới dồn vào cùng lượt', async () => {
    configMock.mockResolvedValue({ signupFormUrl: '', signupNameEntry: '', activeGame: 'math' });
    openMock.mockResolvedValue({
      open: { math: { roundId: 'ABC123', players: 3 }, draw: null, memory: null, spot: null },
      max: 5,
    });
    renderAt('/');

    await waitFor(() => expect(screen.getByText(/3\/5 đang chờ/)).toBeTruthy());
    expect(screen.getByText(/còn 2 nữa/)).toBeTruthy();
  });

  it('trò đang mở mà chưa ai chờ thì nói rõ, không để trống gây đoán', async () => {
    configMock.mockResolvedValue({ signupFormUrl: '', signupNameEntry: '', activeGame: 'draw' });
    openMock.mockResolvedValue({ open: { math: null, draw: null, memory: null, spot: null }, max: 5 });
    renderAt('/');

    // ĐÚNG MỘT ô: các trò chưa tới lượt không nói chuyện chờ đợi gì cả.
    await waitFor(() =>
      expect(screen.getAllByText(/chưa có ai — bạn vào là người đầu tiên/)).toHaveLength(1),
    );
  });

  it('KHÔNG gọi /api/rounds/open ở Cách B — lượt đã do URL quyết định', async () => {
    renderAt('/r/abc123');
    await waitFor(() => expect(screen.getByLabelText(/tên của bạn/i)).toBeTruthy());
    expect(openMock).not.toHaveBeenCalled();
  });

  it('endpoint lỗi thì vẫn chơi được, chỉ là không có số', async () => {
    openMock.mockRejectedValue(new Error('mất mạng'));
    renderAt('/');

    fireEvent.change(nameField(), { target: { value: 'Minh' } });
    await act(async () => {
      fireEvent.click(joinButton());
    });
    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
  });
});
