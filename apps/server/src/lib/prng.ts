/**
 * mulberry32 — PRNG nhỏ, tất định: cùng seed → cùng dãy số.
 * Server sinh câu hỏi bằng hàm này nên có thể tái lập lại đúng dãy câu hỏi.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Số nguyên ngẫu nhiên trong [min, max] (bao gồm cả hai đầu). */
export function randInt(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}
