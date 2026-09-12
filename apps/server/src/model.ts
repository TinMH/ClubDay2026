/**
 * Nguồn duy nhất cho cấu hình model nhận diện hình vẽ.
 *
 * ⚠️ ĐÃ ĐO THẬT — không đổi mà không chạy lại scripts/eval-model:
 *
 *   dtype    top-1 (200 mẫu QuickDraw thật, 20 class)
 *   fp32     82.5%   ✅ DÙNG CÁI NÀY
 *   fp16     —       ❌ load lỗi (onnxruntime từ chối node LayerNorm đã convert)
 *   q8       7.0%    ❌ ÂM THẦM phá nát model (chance = 0.29%)
 *
 * q8 không báo lỗi, không warning, load 0.6s, inference 4ms — chỉ đơn giản là trả
 * về kết quả sai một cách rất tự tin. Tuyệt đối không "tối ưu RAM" bằng q8 ở đây.
 */

export const MODEL_ID = 'Xenova/quickdraw-mobilevit-small';

/** BẮT BUỘC là 'fp32'. Đổi giá trị này = phải chạy lại eval và đo accuracy. */
export const MODEL_DTYPE = 'fp32' as const;

/** Kích thước input model yêu cầu (28×28 grayscale, 1 kênh, 255 = nét). */
export const MODEL_INPUT_SIZE = 28;
