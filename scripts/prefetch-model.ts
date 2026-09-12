/**
 * Tải model ONNX về ./models để chạy OFFLINE ngày sự kiện.
 *
 *   npm run prefetch
 *
 * Chạy TRƯỚC sự kiện khi còn internet, rồi kiểm tra lại bằng cách rút mạng và chạy
 * lại với MODEL_OFFLINE=1 — model phải load được mà không cần internet.
 */
import { pipeline, env } from '@huggingface/transformers';
import { MODEL_ID, MODEL_DTYPE } from '../apps/server/src/model.ts';

env.cacheDir = process.env.MODEL_CACHE_DIR ?? './models';

console.log(`Đang tải ${MODEL_ID} (dtype=${MODEL_DTYPE}) -> ${env.cacheDir} ...`);
const t0 = Date.now();
await pipeline('image-classification', MODEL_ID, { dtype: MODEL_DTYPE });
console.log(`Xong trong ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
console.log('Kiểm tra: ls models/  -> phải thấy model.onnx');
