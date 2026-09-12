import { existsSync } from 'node:fs';

// Node >= 20.12 có sẵn process.loadEnvFile — không cần dotenv.
if (existsSync('.env')) {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.('.env');
  } catch {
    /* .env hỏng thì bỏ qua, dùng biến môi trường thật */
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
        '      Đặt biến này trước khi chạy sự kiện (xem .env.example).\n',
    );
  }
}
