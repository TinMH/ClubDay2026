// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home';
import { api } from '../lib/api';

/**
 * Canh ĐÚNG lỗi đã xảy ra: trang chủ từng không gửi `game` khi vào lượt, mà
 * server mặc định `'math'` và `openRound` chỉ tìm lượt CÙNG game — nên người
 * chơi luôn bị đẩy vào Tính nhanh và không có đường nào tới game Vẽ.
 *
 * Nửa sản phẩm không tiếp cận được trong khi mọi test vẫn xanh, nên bộ test này
 * bám vào thứ duy nhất chứng minh được: tham số thật gửi kèm lệnh join.
 */

vi.mock('../lib/api', () => ({
  api: { join: vi.fn(), openRounds: vi.fn() },
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
const radio = (re: RegExp) => screen.getByRole('radio', { name: re }) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  joinMock.mockReset();
  openMock.mockReset();
  openMock.mockResolvedValue({ open: { math: null, draw: null }, max: 5 });
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

describe('Home — chọn trò chơi', () => {
  it('chọn Vẽ hình nhanh → join kèm game=draw', async () => {
    renderAt('/');

    fireEvent.click(radio(/vẽ hình nhanh/i));
    fireEvent.change(nameField(), { target: { value: 'Minh' } });
    await act(async () => {
      fireEvent.click(joinButton());
    });

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock.mock.calls[0]?.[0]).toBe('Minh');
    expect(joinMock.mock.calls[0]?.[1]).toEqual({ game: 'draw' });
  });

  it('chọn Tính nhanh → join kèm game=math', async () => {
    renderAt('/');

    fireEvent.click(radio(/tính nhanh/i));
    fireEvent.change(nameField(), { target: { value: 'An' } });
    await act(async () => {
      fireEvent.click(joinButton());
    });

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock.mock.calls[0]?.[1]).toEqual({ game: 'math' });
  });

  it('chưa chọn game thì không vào được, và có nói vì sao', async () => {
    renderAt('/');

    fireEvent.change(nameField(), { target: { value: 'Minh' } });

    expect(joinButton().disabled).toBe(true);
    expect(screen.getByText(/chọn một trò chơi/i)).toBeTruthy();

    await act(async () => {
      fireEvent.click(joinButton());
    });
    expect(joinMock).not.toHaveBeenCalled();
  });

  it('thiếu tên thì vẫn mờ, dù đã chọn game', () => {
    renderAt('/');

    expect(joinButton().disabled).toBe(true);
    fireEvent.click(radio(/vẽ hình nhanh/i));
    expect(joinButton().disabled).toBe(true);

    fireEvent.change(nameField(), { target: { value: 'Minh' } });
    expect(joinButton().disabled).toBe(false);
  });

  it('vào bằng /r/<mã>: không phải chọn game, và KHÔNG gửi game lên server', async () => {
    renderAt('/r/abc123');

    // Game do chính lượt đó quyết định — server bỏ qua `game`, nên cho chọn
    // ở đây là lừa người chơi.
    for (const r of screen.getAllByRole('radio')) {
      expect((r as HTMLInputElement).disabled).toBe(true);
    }

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
    openMock.mockResolvedValue({
      open: { math: { roundId: 'ABC123', players: 3 }, draw: null },
      max: 5,
    });
    renderAt('/');

    await waitFor(() => expect(screen.getByText(/3\/5 đang chờ/)).toBeTruthy());
    expect(screen.getByText(/còn 2 nữa/)).toBeTruthy();
    // Game chưa ai chờ thì nói rõ là mở lượt mới, không để trống gây đoán.
    expect(screen.getByText(/chưa có ai — bạn vào là người đầu tiên/)).toBeTruthy();
  });

  it('lượt có người nhưng chưa ai ở game kia → mỗi ô một trạng thái riêng', async () => {
    openMock.mockResolvedValue({
      open: { math: null, draw: { roundId: 'XYZ999', players: 4 } },
      max: 5,
    });
    renderAt('/');

    await waitFor(() => expect(screen.getByText(/4\/5 đang chờ/)).toBeTruthy());
    expect(screen.getByText(/còn 1 nữa/)).toBeTruthy();
  });

  it('KHÔNG gọi /api/rounds/open ở Cách B — lượt đã do URL quyết định', async () => {
    renderAt('/r/abc123');
    await waitFor(() => expect(screen.getByLabelText(/tên của bạn/i)).toBeTruthy());
    expect(openMock).not.toHaveBeenCalled();
  });

  it('endpoint lỗi thì vẫn chơi được, chỉ là không có số', async () => {
    openMock.mockRejectedValue(new Error('mất mạng'));
    renderAt('/');

    fireEvent.click(radio(/vẽ hình nhanh/i));
    fireEvent.change(nameField(), { target: { value: 'Minh' } });
    await act(async () => {
      fireEvent.click(joinButton());
    });
    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
  });
});
