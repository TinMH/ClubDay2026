/**
 * Dựng link Google Form có điền sẵn tên người chơi.
 *
 * Google Form nhận giá trị điền sẵn qua query `entry.<id>=<giá trị>`, kèm
 * `usp=pp_url`. Lấy mã ô bằng: mở Form → ⋮ → Get pre-filled link.
 *
 * Giữ ở đây thay vì viết thẳng trong component để test được — link sai là người
 * chơi rơi vào trang lỗi đúng bước quan trọng nhất của phễu.
 */

/**
 * @param base  Link Form từ `.env`. Rỗng/sai định dạng → trả '' (nút không hiện).
 * @param entry Mã ô tên, dạng `entry.123456789`. Rỗng → không điền sẵn.
 * @param name  Tên người chơi đã nhập ở lobby.
 */
export function buildSignupUrl(base: string, entry: string, name: string): string {
  const trimmed = base.trim();
  if (!trimmed) return '';

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Link sai định dạng: thà không hiện nút còn hơn dẫn người chơi đi đâu đó lạ.
    return '';
  }

  // Chỉ chấp nhận http(s). Chặn `javascript:` và các scheme khác lọt từ .env vào href.
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';

  const cleanName = name.trim();
  if (entry.trim() && cleanName) {
    url.searchParams.set('usp', 'pp_url');
    url.searchParams.set(entry.trim(), cleanName);
  }

  return url.toString();
}
