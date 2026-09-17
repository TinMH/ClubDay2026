/**
 * Cấu hình CÔNG KHAI cho client.
 *
 * Chỉ trả những thứ ai cũng được biết. `ADMIN_TOKEN` và mọi đường dẫn file
 * KHÔNG bao giờ đi qua đây — client không cần, và endpoint này không có
 * `requireAdmin`.
 *
 * Vì sao phải qua server thay vì nhét vào biến `VITE_` lúc build: BTC đổi link
 * Form thì chỉ sửa .env rồi khởi động lại, không phải chạy `npm run build`
 * giữa lúc đang chạy sự kiện.
 */
import type { FastifyInstance } from 'fastify';
import { SIGNUP_FORM_URL, SIGNUP_NAME_ENTRY } from '../config.js';

export interface ClientConfig {
  /** Rỗng = chưa cấu hình → client KHÔNG hiện nút đăng ký. */
  signupFormUrl: string;
  /** Rỗng = không điền sẵn tên. */
  signupNameEntry: string;
  serverNow: number;
}

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/config', async (): Promise<ClientConfig> => ({
    signupFormUrl: SIGNUP_FORM_URL,
    signupNameEntry: SIGNUP_NAME_ENTRY,
    serverNow: Date.now(),
  }));
}
