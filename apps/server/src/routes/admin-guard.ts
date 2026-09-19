import type { FastifyReply, FastifyRequest } from 'fastify';
import { ADMIN_TOKEN } from '../config.js';

/**
 * Chặn các route quản trị bằng header `x-admin-token`.
 *
 * ADMIN_TOKEN chưa đặt:
 *   - production → CHẶN HẾT. Quên đặt biến thì hỏng trang /admin, chứ không phải
 *     ai cũng bấm được nút BẮT ĐẦU — hỏng theo kiểu im lặng là kiểu tệ hơn.
 *   - dev        → cho qua để chạy thử không cần cấu hình gì; lúc boot đã cảnh báo.
 */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (ADMIN_TOKEN) {
    if (req.headers['x-admin-token'] === ADMIN_TOKEN) return;
    return reply.code(401).send({ error: 'UNAUTHORIZED' });
  }
  if (process.env.NODE_ENV === 'production') {
    req.log.error('ADMIN_TOKEN chưa đặt — từ chối mọi thao tác quản trị.');
    return reply.code(503).send({ error: 'ADMIN_NOT_CONFIGURED' });
  }
}
