import { beforeEach, describe, expect, it } from 'vitest';
import { currentQuestion, submitAnswer } from './math-session.js';
import { generateQuestions } from './math-gen.js';
import { addPlayer, createRound, resetAll } from '../store/store.js';
import { MIN_ANSWER_GAP_MS, type Player, type Round } from '../store/types.js';

const T0 = 1_000_000;
const DURATION = 90_000;

function setup(questionCount = 10): { round: Round; player: Player } {
  const round = createRound('math', T0);
  const player = addPlayer(round, 'An', T0);
  round.questions = generateQuestions(42, questionCount);
  round.startedAt = T0;
  round.endsAt = T0 + DURATION;
  round.status = 'playing';
  return { round, player };
}

/** Đáp án đúng của câu thứ i — theo server, không theo client. */
const truth = (round: Round, i: number): number => round.questions?.[i]?.answer ?? Number.NaN;

describe('math-session — chấm điểm', () => {
  beforeEach(() => resetAll());

  it('trả lời đúng → +1 điểm', () => {
    const { round, player } = setup();
    const res = submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.correct).toBe(true);
    expect(player.score).toBe(1);
    expect(player.correct).toBe(1);
    expect(player.wrong).toBe(0);
  });

  it('trả lời sai → không cộng điểm, ghi nhận sai', () => {
    const { round, player } = setup();
    const res = submitAnswer(round, player, 0, truth(round, 0) + 999, T0 + 1_000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.correct).toBe(false);
    expect(player.score).toBe(0);
    expect(player.wrong).toBe(1);
  });

  it('trả lời đúng thì tự chuyển sang câu kế tiếp', () => {
    const { round, player } = setup();
    const res = submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.index).toBe(1);
      expect(res.question?.prompt).toBe(round.questions?.[1]?.prompt);
    }
    expect(player.qIndex).toBe(1);
  });

  it('hết đề thì đánh dấu finished và không còn câu nào', () => {
    const { round, player } = setup(3);
    let now = T0 + 1_000;
    for (let i = 0; i < 3; i++) {
      const res = submitAnswer(round, player, i, truth(round, i), now);
      now += 500;
      if (i === 2) {
        expect(res.ok).toBe(true);
        if (res.ok) expect(res.question).toBeNull();
      }
    }
    expect(player.finished).toBe(true);
    expect(player.score).toBe(3);
  });
});

describe('math-session — CHỐNG GIAN LẬN', () => {
  beforeEach(() => resetAll());

  it('HẾT GIỜ: không cộng điểm dù đáp án đúng', () => {
    const { round, player } = setup();
    const res = submitAnswer(round, player, 0, truth(round, 0), T0 + DURATION + 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TIME_UP');
    expect(player.score).toBe(0); // ⬅ điểm không đổi
    expect(player.finished).toBe(true);
  });

  it('đúng ngay trước mốc hết giờ thì VẪN được tính', () => {
    const { round, player } = setup();
    const res = submitAnswer(round, player, 0, truth(round, 0), T0 + DURATION);
    expect(res.ok).toBe(true);
    expect(player.score).toBe(1);
  });

  it('SPAM: trả lời nhanh hơn 250ms bị chặn và đánh cờ', () => {
    const { round, player } = setup();
    const first = submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    expect(first.ok).toBe(true);

    const second = submitAnswer(round, player, 1, truth(round, 1), T0 + 1_000 + 100);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('TOO_FAST');
    expect(player.flagged).toBe(true);
    expect(player.score).toBe(1); // ⬅ không được cộng câu thứ hai
  });

  it('cách nhau đúng ngưỡng 250ms thì hợp lệ', () => {
    const { round, player } = setup();
    submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    const res = submitAnswer(round, player, 1, truth(round, 1), T0 + 1_000 + MIN_ANSWER_GAP_MS);
    expect(res.ok).toBe(true);
    expect(player.score).toBe(2);
  });

  it('KHÔNG cho nhảy câu — gửi idx không phải câu hiện tại', () => {
    const { round, player } = setup();
    const res = submitAnswer(round, player, 5, truth(round, 5), T0 + 1_000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_INDEX');
    expect(player.score).toBe(0);
    expect(player.qIndex).toBe(0);
  });

  it('KHÔNG cho trả lời lại câu cũ', () => {
    const { round, player } = setup();
    submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    // câu 0 giờ đã qua, gửi lại idx=0
    const res = submitAnswer(round, player, 0, truth(round, 0), T0 + 2_000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_INDEX');
    expect(player.score).toBe(1); // ⬅ không cộng thêm
  });

  it('đáp án đến từ SERVER: giá trị đúng theo client vẫn sai nếu lệch đề của server', () => {
    const { round, player } = setup();
    // giả lập client "đoán" một đáp án không có trong đề
    const res = submitAnswer(round, player, 0, -1, T0 + 1_000);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.correct).toBe(false);
    expect(player.score).toBe(0);
  });

  it('lượt chưa bắt đầu thì từ chối', () => {
    const { round, player } = setup();
    round.status = 'lobby';
    const res = submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_PLAYING');
  });

  it('lượt đã kết thúc thì từ chối', () => {
    const { round, player } = setup();
    round.status = 'done';
    const res = submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_PLAYING');
  });

  it('người đã finished thì từ chối', () => {
    const { round, player } = setup();
    player.finished = true;
    const res = submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_PLAYING');
  });

  it('lượt chưa có đề thì từ chối, không crash', () => {
    const { round, player } = setup();
    round.questions = null;
    const res = submitAnswer(round, player, 0, 5, T0 + 1_000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_PLAYING');
  });
});

describe('math-session — currentQuestion', () => {
  beforeEach(() => resetAll());

  it('trả về câu hỏi đang mở của người chơi', () => {
    const { round, player } = setup();
    expect(currentQuestion(round, player)?.prompt).toBe(round.questions?.[0]?.prompt);
    submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    expect(currentQuestion(round, player)?.prompt).toBe(round.questions?.[1]?.prompt);
  });

  it('hết đề thì trả null', () => {
    const { round, player } = setup(1);
    submitAnswer(round, player, 0, truth(round, 0), T0 + 1_000);
    expect(currentQuestion(round, player)).toBeNull();
  });
});
