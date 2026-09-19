import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Nạp .env từ GỐC repo, KHÔNG phụ thuộc thư mục khởi động.
 *
 * Lý do: `npm run dev:server` chạy với cwd = `apps/server`, còn `npm start` chạy với
 * cwd = gốc repo. Nếu tìm .env theo cwd thì ở chế độ dev nó bị bỏ qua âm thầm —
 * `/admin` sẽ không được bảo vệ mà không có cảnh báo nào.
 *
 * `src/config.ts` và `dist/config.js` đều nằm sâu 3 cấp dưới gốc repo, nên
 * `../../../` trỏ đúng gốc trong cả hai trường hợp.
 */
const repoRootEnv = join(dirname(fileURLToPath(import.meta.url)), '../../../.env');
const cwdEnv = join(process.cwd(), '.env');

const envFile = existsSync(repoRootEnv) ? repoRootEnv : existsSync(cwdEnv) ? cwdEnv : null;

if (envFile) {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(envFile);
    console.log(`  Cấu hình: nạp từ ${envFile}`);
  } catch (err) {
    console.warn(`  ⚠️  Không nạp được ${envFile}: ${err instanceof Error ? err.message : err}`);
  }
}

import { GAME_KINDS, MAX_PLAYERS, MAX_PLAYERS_CAP, type GameKind } from './store/types.js';

export const PORT = Number(process.env.PORT ?? 8787);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
export const MODEL_CACHE_DIR = process.env.MODEL_CACHE_DIR ?? './models';
export const MODEL_OFFLINE = process.env.MODEL_OFFLINE === '1';
export const SNAPSHOT_FILE = process.env.SNAPSHOT_FILE ?? 'data/rounds.json';

/**
 * Link Google Form đăng ký thành viên — hiện thành nút ở màn kết quả.
 *
 * Để rỗng thì nút KHÔNG hiện (mặc định an toàn: chưa cấu hình thì không dẫn
 * người chơi tới trang lỗi). Đọc lúc khởi động như mọi biến khác, nên đổi link
 * chỉ cần sửa .env rồi khởi động lại — KHÔNG phải build lại web.
 */
export const SIGNUP_FORM_URL = process.env.SIGNUP_FORM_URL ?? '';

/**
 * Mã ô "Họ tên" trong Google Form, dạng `entry.123456789`, để điền sẵn tên người
 * chơi đã nhập ở lobby. Lấy bằng: mở Form → ⋮ → Get pre-filled link.
 *
 * Để rỗng thì vẫn hiện nút, chỉ là người chơi phải tự gõ tên.
 */
export const SIGNUP_NAME_ENTRY = process.env.SIGNUP_NAME_ENTRY ?? '';

/**
 * Số người tối đa mỗi lượt, ĐẶT RIÊNG CHO TỪNG TRÒ.
 *
 *   MAX_PLAYERS=6            → mặc định cho mọi trò
 *   MAX_PLAYERS_DRAW=3       → riêng Vẽ hình nhanh (đè lên mặc định)
 *
 * Vì sao cho đặt riêng: mỗi trò một sức chứa khác nhau ở booth. Vẽ hình bắt máy
 * BTC chạy model cho từng frame của từng người nên đông là chậm; Tính nhanh thì
 * chỉ so vài con số, 10 người cùng lúc vẫn nhẹ tênh.
 *
 * Giá trị hỏng (chữ, số âm, quá trần) bị BỎ QUA kèm cảnh báo chứ không làm sập
 * server: gõ nhầm một biến môi trường lúc 7 giờ sáng ngày sự kiện không đáng để
 * cả hệ thống không lên nổi.
 */
function readMaxPlayers(): Record<GameKind, number> {
  const fallback = clampPlayers(process.env.MAX_PLAYERS, 'MAX_PLAYERS', MAX_PLAYERS);
  const out = {} as Record<GameKind, number>;
  for (const game of GAME_KINDS) {
    const key = `MAX_PLAYERS_${game.toUpperCase()}`;
    out[game] = clampPlayers(process.env[key], key, fallback);
  }
  return out;
}

function clampPlayers(raw: string | undefined, key: string, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PLAYERS_CAP) {
    console.warn(
      `  ⚠️  ${key}="${raw}" không hợp lệ (cần số nguyên 1–${MAX_PLAYERS_CAP}) — dùng ${fallback}.`,
    );
    return fallback;
  }
  return n;
}

export const MAX_PLAYERS_BY_GAME: Record<GameKind, number> = readMaxPlayers();

/** Cảnh báo to nếu chưa đặt ADMIN_TOKEN — trang /admin sẽ không được bảo vệ. */
export function warnIfInsecure(): void {
  if (!ADMIN_TOKEN) {
    console.warn(
      '\n  ⚠️  ADMIN_TOKEN chưa đặt — trang /admin KHÔNG được bảo vệ.\n' +
        '      Tạo file .env ở gốc repo (copy từ .env.example) và đặt ADMIN_TOKEN.\n',
    );
  }
}
