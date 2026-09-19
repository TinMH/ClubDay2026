import { ApiError } from './api';

/**
 * Bốn game chấm điểm khác nhau nhưng NÓI CHUNG MỘT BỘ MÃ LỖI. Ý nghĩa của từng
 * mã là kiến thức dùng chung, nên nó nằm ở đây thay vì được chép lại trong mỗi
 * màn hình — chép thì thêm một mã mới là phải nhớ sửa bốn chỗ, và quên một chỗ
 * thì đúng game đó xử lý sai mà không ai thấy.
 *
 * CÁCH phản ứng thì vẫn để mỗi game tự quyết: Nhớ nhanh hỏi lại chuỗi, Tính
 * nhanh mở lại bàn đáp án, Vẽ hình bỏ qua chờ frame sau. Ép chung cách phản ứng
 * là trừu tượng hoá quá tay.
 */
export type GameFailure =
  /** Lượt đã đóng hoặc hết giờ — không còn gì để làm ở màn hình này. */
  | 'over'
  /** Lần gửi này không được tính, nhưng vẫn chơi tiếp được: gửi lại hoặc hỏi lại server. */
  | 'retry'
  /** Ngoài dự tính — phải nói cho người chơi biết. */
  | 'fatal';

const OVER = new Set(['TIME_UP', 'NOT_PLAYING']);
/**
 * Đều là "lần này không tính, thử lại đi", KHÔNG phải lỗi để báo:
 *   TOO_FAST  — gửi dày hơn mức server cho phép
 *   BAD_INDEX — client lệch số câu với server
 *   BAD_LEVEL — client lệch cấp với server
 *   SEQUENCE  — frame cũ tới sau frame mới
 */
const RETRY = new Set(['TOO_FAST', 'BAD_INDEX', 'BAD_LEVEL', 'SEQUENCE']);

export function classifyGameError(err: unknown): GameFailure {
  if (!(err instanceof ApiError)) return 'fatal';
  if (OVER.has(err.code)) return 'over';
  if (RETRY.has(err.code)) return 'retry';
  return 'fatal';
}
