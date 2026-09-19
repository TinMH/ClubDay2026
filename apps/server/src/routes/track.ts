/**
 * Phần dùng chung của BỐN track game.
 *
 * Trước đây mỗi track tự chép `locate()` và bảng mã lỗi của mình — bốn bản gần
 * như giống hệt nhau. Lúc chia việc cho hai người làm song song thì chép là
 * đúng: không ai phải chờ ai, không ai sửa vào file người kia. Nhưng lý do đó
 * hết hạn từ khi các track merge xong, còn cái giá thì ở lại: sửa một lỗi phải
 * nhớ sửa bốn chỗ, và quên một chỗ thì không có gì báo.
 *
 * File này CHỈ giữ phần bốn track thật sự giống nhau. Phần riêng (schema zod,
 * shape của response) vẫn nằm ở file của từng track — gom nốt chúng vào đây là
 * đổi trùng lặp lấy một lớp trừu tượng mà không ai đọc nổi.
 */
import { findPlayer } from '../store/store.js';
import type { GameKind, Player, Round } from '../store/types.js';

/**
 * Mã lỗi nghiệp vụ → HTTP status, gộp của cả bốn track.
 *
 * Gộp được vì không mã nào mang hai nghĩa: `TIME_UP` luôn là 409 dù ở game nào.
 * Mã lạ (không có trong bảng) rơi về 400 — xem `statusFor`.
 */
const CODE_STATUS: Record<string, number> = {
  // Chung cả bốn track
  NOT_PLAYING: 409,
  TIME_UP: 409,
  TOO_FAST: 429,
  // Tính nhanh
  BAD_INDEX: 400,
  // Vẽ hình nhanh
  SEQUENCE: 409,
  NO_TARGET: 500,
  // Nhớ nhanh + Ô khác màu
  BAD_LEVEL: 400,
};

/** HTTP status cho một mã lỗi nghiệp vụ. Mã lạ → 400 (lỗi phía client). */
export function statusFor(code: string): number {
  return CODE_STATUS[code] ?? 400;
}

/**
 * Tra người chơi và xác nhận họ thuộc ĐÚNG lượt này, ĐÚNG game này.
 *
 * Trả `null` cho cả ba kiểu sai (không có người chơi / nhầm lượt / nhầm game) là
 * cố ý: route chỉ trả 404 chung. Nói rõ "id này có thật nhưng ở lượt khác" là
 * biếu không thông tin cho người đang dò.
 */
export function locatePlayer(
  roundId: string,
  playerId: string,
  game: GameKind,
): { round: Round; player: Player } | null {
  const found = findPlayer(playerId);
  if (!found) return null;
  if (found.round.id.toUpperCase() !== roundId.toUpperCase()) return null;
  if (found.round.game !== game) return null;
  return found;
}
