/**
 * Kiểm tra model load được khi KHÔNG có internet — rủi ro chết người ngày sự kiện.
 *
 *   npm run check:offline
 *
 * Script này chặn mọi request tải model từ internet, rồi load model từ cache ./models.
 * Nếu chạy được nghĩa là sự kiện sẽ không phụ thuộc internet.
 *
 * Chạy trước ngày sự kiện, và lặp lại sau khi đã RÚT MẠNG để chắc chắn.
 */
import { pipeline, env } from '@huggingface/transformers';
import { MODEL_ID, MODEL_DTYPE } from '../apps/server/src/model.ts';

env.cacheDir = process.env.MODEL_CACHE_DIR ?? './models';
env.allowRemoteModels = false; // chặn hẳn internet cho model

console.log(`Chế độ OFFLINE — cache: ${env.cacheDir}`);
console.log(`Model: ${MODEL_ID} (dtype=${MODEL_DTYPE})`);

const t0 = Date.now();
try {
  const clf = await pipeline('image-classification', MODEL_ID, { dtype: MODEL_DTYPE });
  // Chạy thật 1 lần để chắc chắn inference hoạt động, không chỉ là load được
  const { RawImage } = await import('@huggingface/transformers');
  const res = await clf(new RawImage(new Uint8Array(784), 28, 28, 1), { top_k: 1 });
  const top = Array.isArray(res) ? res[0] : res;
  console.log(`✅ OFFLINE OK — load + inference ${Date.now() - t0}ms, top1="${top?.label}"`);
  console.log('   Sự kiện sẽ không phụ thuộc internet.');
} catch (err) {
  console.error('❌ OFFLINE THẤT BẠI — model không load được khi không có mạng.');
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  console.error('\n   Khắc phục: chạy `npm run prefetch` khi còn internet.');
  process.exit(1);
}
