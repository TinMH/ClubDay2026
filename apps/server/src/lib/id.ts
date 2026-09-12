import { randomBytes } from 'node:crypto';

/** Bỏ I, O, 0, 1 — để người chơi đọc mã lượt trên màn hình không bị nhầm. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Mã lượt 6 ký tự. Vừa là id, vừa là join code. */
export function newRoundId(): string {
  let out = '';
  for (const b of randomBytes(6)) out += ALPHABET.charAt(b % ALPHABET.length);
  return out;
}

export function newPlayerId(): string {
  return randomBytes(8).toString('hex');
}
