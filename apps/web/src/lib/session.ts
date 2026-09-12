/** Lưu phiên chơi + token admin vào localStorage (không cần đăng nhập). */
import type { GameKind } from './types';

const SESSION_KEY = 'clubday.session.v1';
const ADMIN_KEY = 'clubday.adminToken.v1';

export interface Session {
  playerId: string;
  roundId: string;
  game: GameKind;
  name: string;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function loadAdminToken(): string {
  return localStorage.getItem(ADMIN_KEY) ?? '';
}

export function saveAdminToken(token: string): void {
  localStorage.setItem(ADMIN_KEY, token);
}
