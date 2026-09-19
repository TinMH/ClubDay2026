import { beforeEach, describe, expect, it } from 'vitest';
import {
  join,
  registerEndHook,
  registerStartHook,
  selectActiveGame,
  skipRound,
  startRound,
  syncRoundStatus,
} from './lobby.js';
import { addPlayer, createRound, getActiveGame, resetAll } from './store.js';
import { DURATION_MS, MAX_PLAYERS } from './types.js';

describe('lobby', () => {
  beforeEach(() => resetAll());

  it('join không kèm roundId thì tự vào lượt đang mở', () => {
    const a = join('An');
    const b = join('Bình');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.round.id).toBe(a.round.id);
  });

  it('từ chối người vượt quá sức chứa của lượt', () => {
    const r = createRound('math');
    for (let i = 0; i < MAX_PLAYERS; i++) join(`p${i}`, { roundId: r.id });
    const res = join('thừa', { roundId: r.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('ROUND_FULL');
  });

  it('sức chứa lấy theo TỪNG LƯỢT, không phải một hằng số chung', () => {
    const r = createRound('math');
    r.maxPlayers = 2; // BTC đặt trò này 2 người trong .env

    expect(join('An', { roundId: r.id }).ok).toBe(true);
    expect(join('Bình', { roundId: r.id }).ok).toBe(true);

    const res = join('Chi', { roundId: r.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('ROUND_FULL');
  });

  it('lượt đầy thì người tiếp theo được mở lượt MỚI, không bị chặn', () => {
    // Cách A (không có mã lượt): đầy chỗ là sang lượt kế, chứ không phải hết cửa.
    const first = join('An');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    first.round.maxPlayers = 1;

    const second = join('Bình');
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.round.id).not.toBe(first.round.id);
  });

  it('lượt nới rộng hơn mặc định thì nhận đủ bấy nhiêu người', () => {
    // Chiều ngược lại của ca trên: `maxPlayers` của lượt là thứ quyết định, cả
    // khi nó LỚN hơn hằng số mặc định. Nếu đâu đó còn so với hằng số chung thì
    // người thứ 6 bị chặn dù BTC đã cho phép 8.
    const r = createRound('math');
    r.maxPlayers = MAX_PLAYERS + 3;

    for (let i = 0; i < MAX_PLAYERS + 3; i++) {
      expect(join(`p${i}`, { roundId: r.id }).ok).toBe(true);
    }
    expect(r.players.size).toBe(MAX_PLAYERS + 3);

    const res = join('thừa', { roundId: r.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('ROUND_FULL');
  });

  it('chặn join sau khi lượt đã bắt đầu — không ai bị thiếu giờ', () => {
    const r = createRound('math');
    join('An', { roundId: r.id });
    startRound(r.id);
    const res = join('Bình', { roundId: r.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('ROUND_STARTED');
  });

  it('báo NOT_FOUND khi mã lượt sai', () => {
    const res = join('An', { roundId: 'ZZZZZZ' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_FOUND');
  });

  it('chỉ MỘT trò được mở: join vào lượt của trò đã đóng bị từ chối', () => {
    const mathRound = createRound('math');
    selectActiveGame('draw');

    const res = join('An', { roundId: mathRound.id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('GAME_CLOSED');
  });

  it('đổi trò thì lượt CHỜ của trò cũ bị đóng, lượt ĐANG CHƠI thì không', () => {
    const waiting = createRound('math');
    const playing = createRound('math');
    join('An', { roundId: playing.id });
    startRound(playing.id);

    const closed = selectActiveGame('draw');

    expect(closed.map((r) => r.id)).toEqual([waiting.id]);
    expect(waiting.status).toBe('done');
    expect(playing.status).toBe('playing');
    expect(getActiveGame()).toBe('draw');
  });

  it('không mở trò nào thì không ai vào được lượt mới', () => {
    selectActiveGame(null);
    const res = join('An');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('GAME_CLOSED');
  });

  it('join tự vào lượt của ĐÚNG trò đang mở', () => {
    selectActiveGame('draw');
    const res = join('An');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.round.game).toBe('draw');
  });

  it('startRound đặt MỘT đồng hồ chung và gọi start hook của đúng game', () => {
    let mathHook = 0;
    let drawHook = 0;
    registerStartHook('math', () => void mathHook++);
    registerStartHook('draw', () => void drawHook++);

    const r = createRound('math');
    join('An', { roundId: r.id });

    const now = 1_000_000;
    const res = startRound(r.id, now);

    expect(res.ok).toBe(true);
    expect(r.status).toBe('playing');
    expect(r.startedAt).toBe(now);
    expect(r.endsAt).toBe(now + DURATION_MS.math);
    expect(mathHook).toBe(1);
    expect(drawHook).toBe(0); // hook của game khác không được chạy
  });

  it('không bắt đầu được khi lượt chưa có ai', () => {
    const r = createRound('math');
    const res = startRound(r.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('EMPTY');
  });

  it('không bắt đầu được hai lần', () => {
    const r = createRound('math');
    join('An', { roundId: r.id });
    startRound(r.id);
    const res = startRound(r.id);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_LOBBY');
  });

  it('syncRoundStatus kết thúc lượt khi HẾT GIỜ', () => {
    const r = createRound('math');
    join('An', { roundId: r.id });
    const now = 1_000_000;
    startRound(r.id, now);

    expect(syncRoundStatus(r, now + 1_000)).toBe(false); // còn thời gian
    expect(r.status).toBe('playing');

    expect(syncRoundStatus(r, now + DURATION_MS.math + 1)).toBe(true);
    expect(r.status).toBe('done');
  });

  it('syncRoundStatus kết thúc lượt khi MỌI NGƯỜI đã finished', () => {
    const r = createRound('math');
    join('An', { roundId: r.id });
    join('Bình', { roundId: r.id });
    const now = 1_000_000;
    startRound(r.id, now);

    const [p1, p2] = [...r.players.values()];
    if (!p1 || !p2) throw new Error('thiếu người chơi');

    p1.finished = true;
    expect(syncRoundStatus(r, now + 100)).toBe(false); // còn p2

    p2.finished = true;
    expect(syncRoundStatus(r, now + 100)).toBe(true);
    expect(r.status).toBe('done');
  });

  it('skipRound kết thúc ngay và đánh dấu mọi người đã xong', () => {
    const r = createRound('draw');
    addPlayer(r, 'An');
    const res = skipRound(r.id, 5_000);
    expect(res.ok).toBe(true);
    expect(r.status).toBe('done');
    expect(r.endsAt).toBe(5_000);
    expect([...r.players.values()].every((p) => p.finished)).toBe(true);
  });

  it('end hook chạy ĐÚNG MỘT LẦN khi lượt kết thúc, và TRƯỚC khi mọi người bị đánh dấu xong', () => {
    /** Trạng thái `finished` của người chơi, ghi lại mỗi lần hook chạy. */
    const seen: string[] = [];
    registerEndHook('draw', (round) => {
      seen.push([...round.players.values()].map((p) => String(p.finished)).join(','));
    });

    const r = createRound('draw');
    join('An', { roundId: r.id });
    const now = 1_000_000;
    startRound(r.id, now);

    expect(syncRoundStatus(r, now + 1_000)).toBe(false);
    expect(seen).toEqual([]); // lượt chưa kết thúc thì hook chưa được chạy

    expect(syncRoundStatus(r, now + DURATION_MS.draw + 1)).toBe(true);
    // Hook phải còn thấy người chơi CHƯA finished — TRACK B dựa vào đó để biết ai
    // còn phải chấm bài. Nếu hook chạy sau vòng lặp đánh dấu thì nó mù thông tin.
    expect(seen).toEqual(['false']);

    // Lượt đã done rồi thì gọi lại không chạy hook lần nữa.
    syncRoundStatus(r, now + DURATION_MS.draw + 2);
    expect(seen).toEqual(['false']);
  });

  it('end hook của game khác không chạy', () => {
    let drawRuns = 0;
    registerEndHook('draw', () => void (drawRuns += 1));

    const r = createRound('math');
    join('An', { roundId: r.id });
    const now = 1_000_000;
    startRound(r.id, now);
    syncRoundStatus(r, now + DURATION_MS.math + 1);

    expect(drawRuns).toBe(0);
  });
});
