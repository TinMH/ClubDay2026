/**
 * Lớp gọi HTTP dùng chung cho MỌI file api-*.
 *
 * Trước đây `request()` và `postJson()` được chép nguyên vào api.ts, api-math.ts,
 * api-draw.ts, api-memory.ts và api-spot.ts — năm bản của cùng một hàm 20 dòng,
 * kể cả phần đồng bộ đồng hồ. Sửa một lỗi ở đây mà quên một bản thì lỗi vẫn còn
 * sống ở đúng cái game không ai nghĩ tới.
 *
 * Mỗi track vẫn giữ file api-* riêng cho phần thuộc về mình: đường dẫn, kiểu dữ
 * liệu, và tài liệu của từng endpoint. Đó mới là chỗ bốn game thật sự khác nhau.
 */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

// ── bù lệch đồng hồ ──
// Máy người chơi có thể lệch giờ so với server. Mọi response đều mang `serverNow`,
// nên ta tính offset một lần rồi quy đổi. Nhờ vậy đồng hồ đếm ngược luôn khớp server.
let clockOffset = 0;

export function serverNow(): number {
  return Date.now() + clockOffset;
}

export function syncClock(serverTime: number): void {
  clockOffset = serverTime - Date.now();
}

/**
 * Gọi API và trả về JSON đã parse.
 *
 * Hai việc kèm theo, và đây là lý do mọi lời gọi phải đi qua hàm này:
 *   - Lỗi HTTP → `ApiError` mang MÃ NGHIỆP VỤ của server (`TIME_UP`,
 *     `ROUND_FULL`…), để màn hình xử lý theo mã chứ không theo chuỗi thông báo.
 *   - Response nào có `serverNow` thì đồng hồ client chỉnh lại theo server.
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const code =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'HTTP_ERROR';
    throw new ApiError(code, res.status);
  }

  if (data && typeof data === 'object' && 'serverNow' in data) {
    syncClock(Number((data as { serverNow: unknown }).serverNow));
  }
  return data as T;
}

/** POST một body JSON. `token` chỉ có ở route quản trị. */
export const postJson = (body: unknown, token?: string): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { 'x-admin-token': token } : {}),
  },
  body: JSON.stringify(body),
});

/** GET, kèm mã quản trị nếu có. */
export const getJson = <T>(path: string, token?: string): Promise<T> =>
  request<T>(path, token ? { headers: { 'x-admin-token': token } } : undefined);
