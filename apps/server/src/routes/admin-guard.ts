import type { FastifyReply, FastifyRequest } from 'fastify';
import { ADMIN_TOKEN } from '../config.js';

/**
 * Chặn các route quản trị bằng header `x-admin-token`.
 *
 * Nếu ADMIN_TOKEN chưa được đặt (chỉ khi phát triển), cho qua — lúc boot đã cảnh báo.
 * Trước khi chạy sự kiện BẮT BUỘC đặt biến này.
 */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!ADMIN_TOKEN) return;
  if (req.headers['x-admin-token'] === ADMIN_TOKEN) return;
  reply.code(401).send({ error: 'UNAUTHORIZED' });
}
