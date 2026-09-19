// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MathGame } from './MathGame';
import { mathApi, type AnswerResult, type QuestionState } from '../lib/api-math';
import { ApiError } from '../lib/api';
import type { RoundState } from '../lib/types';

/**
 * Kiểm phần ĐIỀU KHIỂN của màn hình Tính nhanh: gửi gì lên server, và hiển thị
 * lại đúng những con số server trả về.
 *
 * Điểm mấu chốt: màn hình này KHÔNG được tự đếm. Chuỗi đúng và kỷ lục đều do
 * server giữ — tự cộng ở client thì tải lại trang giữa lượt là hai bên lệch
 * nhau, và người chơi thấy một con số không khớp bảng hạng.
 */

vi.mock('../lib/api-math', () => ({
  mathApi: { question: vi.fn(), answer: vi.fn() },
}));

const questionMock = vi.mocked(mathApi.question);
const answerMock = vi.mocked(mathApi.answer);

const state: RoundState = {
  roundId: 'ABC123',
  game: 'math',
  status: 'playing',
  serverNow: 0,
  startedAt: 0,
  endsAt: 90_000,
  maxPlayers: 5,
  players: [],
};

const questionState = (over: Partial<QuestionState> = {}): QuestionState => ({
  roundId: 'ABC123',
  status: 'playing',
  index: 0,
  question: { prompt: '7 + 5', options: [12, 11, 13, 10] },
  score: 0,
  streak: 0,
  correct: 0,
  wrong: 0,
  endsAt: 90_000,
  serverNow: 0,
  ...over,
});

const answerResult = (over: Partial<AnswerResult> = {}): AnswerResult => ({
  correct: true,
  score: 1,
  streak: 1,
  correctCount: 1,
  wrongCount: 0,
  index: 1,
  question: { prompt: '9 - 4', options: [5, 6, 4, 3] },
  serverNow: 0,
  ...over,
});

const renderGame = () => render(<MathGame roundId="ABC123" playerId="p1" state={state} />);

const choices = () => screen.getAllByRole('button', { name: /^Đáp án \d+: / });
/** Ô đáp án thứ `i` (0-based) — ném lỗi rõ ràng thay vì `undefined` lặng lẽ. */
function choice(i: number): HTMLElement {
  const el = choices()[i];
  if (!el) throw new Error(`Không có ô đáp án số ${i}`);
  return el;
}

beforeEach(() => {
  questionMock.mockReset();
  answerMock.mockReset();
  questionMock.mockResolvedValue(questionState());
  answerMock.mockResolvedValue(answerResult());
});

afterEach(() => cleanup());

describe('MathGame', () => {
  it('hiện câu hỏi và bốn lựa chọn server gửi về', async () => {
    renderGame();
    await waitFor(() => expect(screen.getByText('7 + 5')).toBeTruthy());
    expect(choices()).toHaveLength(4);
  });

  it('bấm ô nào thì gửi ĐÚNG giá trị ô đó kèm số câu — không gửi đúng/sai', async () => {
    renderGame();
    await waitFor(() => expect(choices()).toHaveLength(4));

    await act(async () => {
      fireEvent.click(choice(2)); // giá trị 13
    });

    await waitFor(() => expect(answerMock).toHaveBeenCalledTimes(1));
    expect(answerMock).toHaveBeenCalledWith('ABC123', 'p1', 0, 13);
  });

  it('sang câu tiếp theo bằng dữ liệu server trả về, không hỏi lại', async () => {
    renderGame();
    await waitFor(() => expect(screen.getByText('7 + 5')).toBeTruthy());

    await act(async () => {
      fireEvent.click(choice(0));
    });

    await waitFor(() => expect(screen.getByText('9 - 4')).toBeTruthy());
    expect(questionMock).toHaveBeenCalledTimes(1); // chỉ lần nạp đầu
  });

  it('chuỗi đúng lấy TỪ SERVER, không tự cộng ở client', async () => {
    // Server nói chuỗi đang là 8 (người chơi vừa tải lại trang giữa lượt).
    // Dùng số không trùng với đáp án nào trên bàn, để `getByText` chỉ có một chỗ khớp.
    questionMock.mockResolvedValue(questionState({ streak: 8, score: 20 }));
    renderGame();

    await waitFor(() => expect(screen.getByText('8')).toBeTruthy());
    expect(screen.getByText(/tốt nhất 20/)).toBeTruthy();

    // Trả lời đúng một câu: server nói 9, client phải hiện đúng 9.
    answerMock.mockResolvedValue(answerResult({ streak: 9, score: 20 }));
    await act(async () => {
      fireEvent.click(choice(0));
    });
    await waitFor(() => expect(screen.getByText('9')).toBeTruthy());
  });

  it('trả lời sai → chuỗi về đúng con số server nói', async () => {
    questionMock.mockResolvedValue(questionState({ streak: 3, score: 3 }));
    answerMock.mockResolvedValue(answerResult({ correct: false, streak: 0, score: 3 }));
    renderGame();
    await waitFor(() => expect(choices()).toHaveLength(4));

    await act(async () => {
      fireEvent.click(choice(0));
    });

    await waitFor(() => expect(screen.getByText(/Sai mất rồi/)).toBeTruthy());
    expect(screen.getByText(/tốt nhất 3/)).toBeTruthy();
  });

  it('gõ nhanh quá bị server chặn → bỏ qua im lặng, chơi tiếp được', async () => {
    answerMock.mockRejectedValueOnce(new ApiError('TOO_FAST', 429));
    renderGame();
    await waitFor(() => expect(choices()).toHaveLength(4));

    await act(async () => {
      fireEvent.click(choice(0));
    });
    // Không hiện lỗi: đây là chuyện của máy, người chơi chỉ cần bấm lại.
    expect(screen.queryByRole('alert')).toBeNull();

    answerMock.mockResolvedValue(answerResult());
    await act(async () => {
      fireEvent.click(choice(1));
    });
    await waitFor(() => expect(answerMock).toHaveBeenCalledTimes(2));
  });

  it('hết giờ → KHÔNG báo lỗi (màn hình do SSE chuyển, không phải do lỗi)', async () => {
    // Hết giờ không phải là hỏng: server đã đóng lượt, và `Play.tsx` sẽ chuyển
    // sang bảng hạng khi SSE báo lượt done. Hiện "có lỗi, thử lại" ở đây là nói
    // sai với người chơi về thứ vừa xảy ra.
    answerMock.mockRejectedValue(new ApiError('TIME_UP', 409));
    renderGame();
    await waitFor(() => expect(choices()).toHaveLength(4));

    await act(async () => {
      fireEvent.click(choice(0));
    });

    await waitFor(() => expect(answerMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lỗi lạ thì nói cho người chơi biết', async () => {
    answerMock.mockRejectedValue(new ApiError('HTTP_ERROR', 500));
    renderGame();
    await waitFor(() => expect(choices()).toHaveLength(4));

    await act(async () => {
      fireEvent.click(choice(0));
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('không tải được câu hỏi → báo lỗi, không đứng im', async () => {
    questionMock.mockRejectedValue(new Error('mất mạng'));
    renderGame();
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });
});
