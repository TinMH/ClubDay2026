import { beforeEach, describe, expect, it } from 'vitest';
import {
  addPlayer,
  createRound,
  findPlayer,
  getMaxPlayers,
  getRound,
  openRound,
  resetAll,
  setMaxPlayers,
} from './store.js';
import { MAX_PLAYERS } from './types.js';

describe('store', () => {
  beforeEach(() => resetAll());

  it('tạo lượt với mã 6 ký tự, loại bỏ ký tự dễ nhầm', () => {
    const r = createRound('math');
    expect(r.id).toMatch(/^[A-HJ-NP-Z2-9]{6}$/); // không có I, O, 0, 1
    expect(r.status).toBe('lobby');
    expect(r.players.size).toBe(0);
  });

  it('BTC đổi sức chứa → lượt TẠO SAU nhận con số mới', () => {
    setMaxPlayers('draw', 3);
    expect(getMaxPlayers().draw).toBe(3);
    expect(createRound('draw').maxPlayers).toBe(3);
  });

  it('lượt ĐÃ TẠO giữ nguyên sức chứa cũ khi BTC đổi số', () => {
    // Nếu lượt đọc con số hiện hành thì một lượt đang 3/3 bỗng thành 3/2, và hai
    // người đã đứng xếp hàng tự dưng thành thừa.
    const before = createRound('math');
    const was = before.maxPlayers;

    setMaxPlayers('math', was + 4);

    expect(before.maxPlayers).toBe(was);
    expect(createRound('math').maxPlayers).toBe(was + 4);
  });

  it('getMaxPlayers trả BẢN SAO — sửa nó không đụng tới store', () => {
    const snapshot = getMaxPlayers();
    const was = snapshot.spot;
    snapshot.spot = 99;
    expect(getMaxPlayers().spot).toBe(was);
  });

  it('getRound nhận cả chữ thường', () => {
    const r = createRound('math');
    expect(getRound(r.id.toLowerCase())?.id).toBe(r.id);
  });

  it('openRound trả về đúng lượt đang mở, không tạo mới', () => {
    const a = openRound('math');
    const b = openRound('math');
    expect(b.id).toBe(a.id);
  });

  it('openRound tạo lượt mới khi lượt cũ đã đủ 5 người', () => {
    const a = openRound('math');
    for (let i = 0; i < MAX_PLAYERS; i++) addPlayer(a, `p${i}`);
    const b = openRound('math');
    expect(b.id).not.toBe(a.id);
  });

  it('openRound tách riêng theo game', () => {
    const math = openRound('math');
    const draw = openRound('draw');
    expect(draw.id).not.toBe(math.id);
    expect(draw.game).toBe('draw');
  });

  it('findPlayer tra ngược được từ playerId', () => {
    const r = createRound('math');
    const p = addPlayer(r, 'An');
    const found = findPlayer(p.id);
    expect(found?.round.id).toBe(r.id);
    expect(found?.player.name).toBe('An');
  });

  it('findPlayer trả null với id lạ', () => {
    expect(findPlayer('khong-ton-tai')).toBeNull();
  });

  it('tên rỗng hoặc chỉ khoảng trắng thành "Ẩn danh"', () => {
    const r = createRound('math');
    expect(addPlayer(r, '   ').name).toBe('Ẩn danh');
  });
});
