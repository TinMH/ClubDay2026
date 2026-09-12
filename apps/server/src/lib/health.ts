/**
 * Thanh ghi health-check — để các track báo cáo tình trạng của mình
 * MÀ KHÔNG phải sửa `app.ts` (file nền tảng, đã đóng băng).
 *
 * TRACK B dùng:
 *   registerHealth('model', () => (modelReady() ? 'ready' : 'not-loaded'))
 */
export type HealthCheck = () => string | Promise<string>;

const checks = new Map<string, HealthCheck>();

export function registerHealth(name: string, fn: HealthCheck): void {
  checks.set(name, fn);
}

export async function healthReport(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, fn] of checks) {
    try {
      out[name] = await fn();
    } catch (err) {
      out[name] = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return out;
}
