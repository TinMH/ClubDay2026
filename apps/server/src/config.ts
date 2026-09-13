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

export const PORT = Number(process.env.PORT ?? 8787);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
export const MODEL_CACHE_DIR = process.env.MODEL_CACHE_DIR ?? './models';
export const MODEL_OFFLINE = process.env.MODEL_OFFLINE === '1';
export const SNAPSHOT_FILE = process.env.SNAPSHOT_FILE ?? 'data/rounds.json';

/** Cảnh báo to nếu chưa đặt ADMIN_TOKEN — trang /admin sẽ không được bảo vệ. */
export function warnIfInsecure(): void {
  if (!ADMIN_TOKEN) {
    console.warn(
      '\n  ⚠️  ADMIN_TOKEN chưa đặt — trang /admin KHÔNG được bảo vệ.\n' +
        '      Tạo file .env ở gốc repo (copy từ .env.example) và đặt ADMIN_TOKEN.\n',
    );
  }
}
