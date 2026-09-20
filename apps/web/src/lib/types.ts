/**
 * Kiểu của riêng phía web.
 *
 * Phần HỢP ĐỒNG với server (danh sách game, thời lượng, nhãn, các hằng số chống
 * gian lận, hình dạng dữ liệu đi trên dây) nằm ở `@clubday/contract` và được tái
 * xuất ngay dưới đây — trước kia nó là một bản chép tay, chỉ được canh bằng
 * comment "phải khớp", và lệch một con số là lỗi im lặng.
 *
 * Ở lại file này: những thứ server KHÔNG cần biết — nhãn hiển thị, giá trị mặc
 * định lúc chưa nạp xong dữ liệu, và props nội bộ giữa các màn hình.
 */
export * from '@clubday/contract';

import { MAX_PLAYERS, type GameKind, type RoundState, type RoundStatus } from '@clubday/contract';

export interface RoundSummary {
  roundId: string;
  game: GameKind;
  status: RoundStatus;
  playerCount: number;
  maxPlayers: number;
  createdAt: number;
  live: boolean;
}

/**
 * Props mà Play.tsx truyền cho màn hình của từng game.
 * ĐÂY LÀ HỢP ĐỒNG giữa dispatcher và bốn màn hình game.
 */
export interface GameProps {
  roundId: string;
  playerId: string;
  state: RoundState;
}

/**
 * Nhãn cho con số mà BẢNG HẠNG xếp theo.
 *
 * Con số này mỗi game một nghĩa — Tính nhanh là chuỗi đúng dài nhất, Vẽ hình là
 * điểm theo thời gian — nên hiện trơ ra mà không có nhãn thì người chơi sẽ hiểu
 * sai. Ví dụ: trả lời đúng 12 câu mà ô điểm ghi "3" thì trông như lỗi.
 *
 * Chỉ dùng ở client; server không render chữ nào.
 */
export const SCORE_LABEL: Record<GameKind, string> = {
  math: 'Chuỗi dài nhất',
  draw: 'Điểm',
  memory: 'Cấp cao nhất',
  spot: 'Cấp cao nhất',
};

/**
 * Số người mỗi lượt khi CHƯA biết cấu hình thật (lúc trang vừa mở, hoặc mất mạng).
 *
 * Con số thật đến từ server và mỗi trò một khác. Lấy ở:
 *   - phòng chờ  → `state.maxPlayers` (của chính lượt đó)
 *   - trang chủ  → `config.maxPlayers[game]` / `openRounds.max[game]`
 *   - /admin     → `maxPlayers` trong danh sách lượt
 * Dùng hằng số này để vẽ "x/5" là nói sai với người chơi khi BTC đặt khác 5.
 */
export const DEFAULT_MAX_PLAYERS = MAX_PLAYERS;

/**
 * Ô sáng bao lâu trong một nhịp phát lại của Nhớ nhanh (phần còn lại là khe tối).
 *
 * Chỉ client cần biết (server chỉ quan tâm `MEMORY_STEP_MS` — tổng một nhịp), nên
 * nó ở lại đây chứ không vào hợp đồng chung.
 */
export const MEMORY_LIT_MS = 380;

/**
 * Khoảng lặng TRƯỚC khi chuỗi bắt đầu nháy.
 *
 * Không có nó thì ô đầu tiên nháy ngay lúc màn hình vừa đổi, và người chơi còn
 * đang nhìn chỗ khác — họ mất ô đầu mà không biết là đã mất. Một nhịp "chuẩn
 * bị" ngắn kéo mắt về đúng bàn ô trước khi có gì để nhớ.
 */
export const MEMORY_LEAD_IN_MS = 700;
