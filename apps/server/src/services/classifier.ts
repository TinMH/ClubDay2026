/**
 * Model nhận diện hình vẽ — nạp MỘT LẦN, giữ nóng trong RAM, chạy tuần tự.
 *
 * Ba quy tắc sống còn:
 *
 *   1. dtype PHẢI là `fp32` (xem `src/model.ts`). q8 làm accuracy 82.5% → 7.0%
 *      mà không báo một lỗi hay warning nào.
 *   2. Nạp lúc KHỞI ĐỘNG và warmup, không nạp lười ở request đầu. Người chơi
 *      đầu tiên sẽ phải chờ 2–3s load model ngay giữa lúc đồng hồ 15s đang chạy.
 *   3. Mọi inference đi qua MỘT hàng đợi duy nhất. ONNX runtime là CPU-bound:
 *      5 người cùng gửi frame mà chạy song song thì chỉ tranh CPU của nhau, p95
 *      tăng mà không ai nhanh hơn.
 */
import { env, pipeline, RawImage } from '@huggingface/transformers';
import { MODEL_CACHE_DIR, MODEL_OFFLINE } from '../config.js';
import { MODEL_DTYPE, MODEL_ID, MODEL_INPUT_SIZE } from '../model.js';
import type { Prediction } from '../store/types.js';

env.cacheDir = MODEL_CACHE_DIR;

// Ngày sự kiện: rút mạng vẫn phải chạy. `MODEL_OFFLINE=1` chặn hẳn mọi request
// ra HuggingFace — nếu cache thiếu file thì lỗi ngay lúc khởi động, còn hơn lỗi
// giữa lượt thi.
if (MODEL_OFFLINE) env.allowRemoteModels = false;

/**
 * Kiểu tối thiểu mà mình thực sự dùng — generic của thư viện phức tạp hơn nhiều
 * so với nhu cầu ở đây.
 */
type ClassifierPipe = (
  image: RawImage,
  opts: { top_k: number },
) => Promise<Array<{ label: string; score: number }>>;

let pipe: ClassifierPipe | null = null;
let loadError: string | null = null;

/** Hàng đợi dùng chung: mỗi request nối vào đuôi promise của request trước. */
let chain: Promise<unknown> = Promise.resolve();

export function modelReady(): boolean {
  return pipe !== null;
}

/** Trạng thái cho `/api/health` — thấy được cả lúc đang nạp và lúc nạp lỗi. */
export function modelState(): string {
  if (loadError) return `error: ${loadError}`;
  return pipe ? 'ready' : 'loading';
}

/**
 * Nạp model và warmup. Gọi lúc khởi động, KHÔNG chờ (xem `routes/draw.ts`).
 * Gọi nhiều lần vô hại — lần thứ hai thoát ngay.
 */
export async function loadModel(): Promise<void> {
  if (pipe) return;

  const t0 = Date.now();

  try {
    const raw = await pipeline('image-classification', MODEL_ID, {
      // BẮT BUỘC — giá trị này đã được đo, xem bảng ở src/model.ts.
      dtype: MODEL_DTYPE,
    });
    const loaded = raw as unknown as ClassifierPipe;

    // Warmup: lần inference đầu tiên cấp phát arena cho ONNX và biên dịch kernel.
    // Bỏ qua bước này thì người chơi đầu tiên trả giá gấp nhiều lần p50.
    const blank = new RawImage(
      new Uint8Array(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE),
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
      1,
    );
    for (let i = 0; i < 3; i++) await loaded(blank, { top_k: 3 });

    pipe = loaded;
    loadError = null;
    console.log(
      `  Model: ${MODEL_ID} (${MODEL_DTYPE}) sẵn sàng sau ${Date.now() - t0}ms`,
    );
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

/**
 * Phân loại một ảnh 28×28 (`Uint8Array` 784 byte, 255 = nét).
 *
 * ⚠️ Truyền `Uint8Array` giá trị 0–255. Truyền `Float32Array` 0–1 sẽ bị chia
 * cho 255 LẦN THỨ HAI (bộ tiền xử lý đã tự chia), ảnh thành gần đen và MỌI ảnh
 * cho cùng một kết quả.
 */
export function classify(px: Uint8Array, topK = 3): Promise<Prediction[]> {
  const run = async (): Promise<Prediction[]> => {
    // Đọc `pipe` bên trong closure: nếu model nạp xong sau khi request đã xếp
    // hàng thì request đó vẫn chạy được thay vì báo lỗi.
    const p = pipe;
    if (!p) throw new Error(loadError ?? 'MODEL_NOT_LOADED');

    const res = await p(
      new RawImage(px, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 1),
      { top_k: topK },
    );
    const list = Array.isArray(res) ? res : [res];
    return list.map((r) => ({ label: r.label, score: r.score }));
  };

  // Nối vào đuôi hàng đợi. `catch` ở nhánh lưu `chain` để một request lỗi không
  // làm chết cả hàng đợi phía sau.
  const out = chain.then(run, run);
  chain = out.catch(() => undefined);
  return out;
}
