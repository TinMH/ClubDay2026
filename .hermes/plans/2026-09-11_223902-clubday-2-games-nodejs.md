# ClubDay — Web 2 trò chơi cho sự kiện (Node.js) — Implementation Plan

> **Cho Hermes:** thực thi theo từng task bằng skill `subagent-driven-development` (1 subagent / task + review 2 bước).
> **Nguồn gốc plan:** `D:\Side\Clubday`

**Goal:** Web app gồm 2 game cho sự kiện CLB — (1) *Tính nhanh* 90s có chống gian lận phía server + bảng xếp hạng, (2) *Vẽ hình nhanh* 15s nhận diện bằng AI — chạy trên Node.js, một máy chủ duy nhất, mở qua Wi-Fi của sự kiện.

**Architecture:** 1 process Node.js (Fastify) giữ **model AI nóng sẵn trong RAM** + SQLite nhúng + phục vụ luôn static build của React. Client React/Vite. Không có service trung gian, không Docker, không Python.

**Tech stack:** Node 24 · Fastify 5 · `node:sqlite` (built-in) · `@huggingface/transformers` (Transformers.js v4 + onnxruntime-node) · React 19 + Vite + TypeScript · SSE.

---

## 0. Spike đã chạy & số liệu ĐO THẬT (không phải giả định)

Toàn bộ phần rủi ro nhất (nhận diện hình vẽ) **đã được đo trước khi viết plan**, trên dữ liệu QuickDraw thật tải từ Google:

### 0.1 Chọn model — phát hiện quan trọng

| Model | Top-1 | Top-3 | p50 | Size | Kết luận |
|---|---|---|---|---|---|
| `Xenova/quickdraw-mobilevit-small` (bản transformers.js phổ biến nhất, ai cũng sẽ chọn) | **7.5%** (6/80) | 10% | 4ms | 5.6MB | ❌ **HỎNG** — vô dụng |
| `JoshuaKelleyDs/quickdraw-MobileVITV2-2.0-Finetune` | **82.0%** | **96.0%** | 33ms | 18.4MB | ✅ **CHỌN** |
| `JoshuaKelleyDs/quickdraw-ConvNeXTV2-Tiny-Finetune` | 76.97% (eval công bố) | — | ~60ms | 112MB | dự phòng |
| `JoshuaKelleyDs/quickdraw-ConvNeXT-Tiny-Finetune` | 78.26% (eval công bố) | — | ~90ms | 112MB | dự phòng |

> **Cảnh báo chốt lại:** model `Xenova/quickdraw-mobilevit-small` (5.6MB, "quantized", đúng chuẩn Transformers.js, trông rất hợp lý trên giấy) chỉ đạt **7.5%** trên chính dữ liệu QuickDraw thật — tức là **suýt vô dụng** (random = 0.29%). Nếu chọn theo cảm tính "model nhỏ, có sẵn, chuẩn thư viện" thì game vẽ sẽ hỏng hoàn toàn mà phải đến lúc chạy sự kiện mới phát hiện. **Bắt buộc dùng model trong bảng đã đo.**

Đo trên 100 mẫu thật, 10 class: `circle 10/10 · house 10/10 · star 10/10 · envelope 10/10 · apple 9/10 · line 8/10 · cat 8/10 · fish 7/10 · tree 6/10 · face 4/10`.
(82% là trên 10 class "dễ"; trên đủ 345 class nhà công bố 76.2% — dùng con số 76% để tính toán an toàn.)

### 0.2 Rasterizer: stroke → 28×28 (đã hiệu chỉnh)

Model nhận input **28×28 grayscale, 1 kênh**. Quét các cấu hình vẽ, đo lại trên **dữ liệu stroke thật** (`full/raw/*.ndjson`):

| boxFrac | Độ dày nét | Top-1 | Top-3 |
|---|---|---|---|
| 0.85 | 1.0 | 60.9% | 84.4% |
| **0.85** | **1.5** | **70.3%** | **95.3%** | ✅ **CHỐT** |
| 1.00 | 1.5 | 57.8% | 89.1% |
| 0.85 | 2.0 | 35.9% | 70.3% |
| 1.00 | 2.5 | 18.8% | 50.0% |

**Bài học đo được:** độ dày nét ở 28×28 quyết định sống còn (1.5px = 70%, 2.5px = 19%). Không được "vẽ cho đẹp rồi thu nhỏ tuỳ ý".

### 0.3 Hạ tầng đã xác minh trên máy này

- `node v24.13.0`, `npm 11.6.2`, 12 CPU.
- `node:sqlite` **built-in** chạy tốt (query 5.000 dòng = 1ms) → **không cần cài native module nào** (bỏ được `better-sqlite3`, bỏ luôn `sharp`).
- Model load lần đầu 0.7–7s (sau đó cache), inference p50 **33ms**, p95 73ms, RSS **146MB**.

> **Hệ quả thiết kế:** chỉ còn **1 dependency native duy nhất** (`onnxruntime-node`, có prebuilt binary). Ngày sự kiện không cần biên dịch gì → rủi ro cài đặt gần như bằng 0.

---

## 1. Kiến trúc tổng thể

```
                    ┌──────────────── MỘT PROCESS NODE.JS (máy BTC) ────────────────┐
  Điện thoại/Laptop │                                                              │
  của người chơi    │   Fastify 5                                                  │
      │             │   ├── /api/math/*        → math-session.ts (Server là TRỌNG TÀI)│
      │  HTTP/SSE   │   ├── /api/draw/*        → draw-session.ts + classifier.ts    │
      └────────────►│   ├── /api/leaderboard   → queries.ts (ORDER BY score DESC)   │
                    │   ├── /api/lb/stream     → SSE, đẩy top mới realtime          │
                    │   └── /*                 → static build React (dist/)        │
                    │                                                              │
                    │   node:sqlite (file clubday.db, WAL)  ← sessions, questions   │
                    │   Model ONNX nóng trong RAM (18.4MB, warmup lúc boot)         │
                    └──────────────────────────────────────────────────────────────┘
```

**Vì sao 1 process, không tách AI service?** Model 18.4MB nằm sẵn trong RAM, inference 33ms. Tách service riêng chỉ thêm 1 chặng HTTP + 1 thứ để sập. Đây là sự kiện 1 ngày, 1 máy — tối giản là tối ưu.

**Vì sao Fastify + Vite, không Next.js?** Model phải nằm trong process sống lâu (long-lived). Next.js tự host được nhưng App Router + build pipeline không giúp gì cho LAN event, còn làm việc giữ model "nóng" rối hơn. Fastify + Vite build ra static, phục vụ qua `@fastify/static`.

### 1.1 Quyết định cần bạn chốt (2 điểm lệch so với mô tả ban đầu)

**① Dữ liệu gửi lên mỗi frame: nét vẽ (stroke) hay ảnh base64?**

Mô tả của bạn: mã hoá base64 ảnh canvas gửi mỗi 1–2s. **Đề xuất đổi sang gửi mảng stroke.**

| | base64 PNG | **Stroke (đề xuất)** |
|---|---|---|
| Payload/frame | 30–100KB | **2–10KB** |
| Server nhận gì | Ảnh đã vẽ sẵn → **client có thể làm giả** | Toạ độ nét thô → server tự vẽ lại |
| Đúng phân bố model | Phải tự đoán cách render | Model vốn train từ **stroke data** → khớp tự nhiên |
| Cần thư viện ảnh | `sharp`/`opencv` (native) | **Không cần gì** |

Vẫn giữ được ý "gửi theo chu kỳ mỗi 1s". Nếu bạn vẫn muốn nhánh base64 (để test/đối chiếu) thì thêm 1 endpoint phụ, nhưng đường chính nên là stroke.

**② Ngưỡng chấp nhận:** model top-1 = 70%, top-3 = 95%. Nên chấp nhận **top-3** (kèm điều kiện điểm) để người chơi không bị "AI ngu" oan → tỉ lệ công nhận thực tế ~95%.

---

## 2. Cấu trúc thư mục

```
D:\Side\Clubday\
├─ package.json                      # npm workspaces (root)
├─ tsconfig.base.json
├─ .gitignore                        # node_modules, dist, *.db, models/
├─ apps/
│  ├─ server/
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ src/
│  │     ├─ index.ts                 # bootstrap + warmup model
│  │     ├─ app.ts                   # fastify factory (testable)
│  │     ├─ config.ts                # port, timing, paths
│  │     ├─ db/
│  │     │  ├─ index.ts              # openDatabase() + pragmas
│  │     │  ├─ schema.sql
│  │     │  └─ queries.ts            # session CRUD + leaderboard
│  │     ├─ routes/
│  │     │  ├─ math.ts
│  │     │  ├─ draw.ts
│  │     │  ├─ leaderboard.ts
│  │     │  └─ admin.ts
│  │     ├─ services/
│  │     │  ├─ math-gen.ts           # sinh câu hỏi (PRNG có seed)
│  │     │  ├─ math-session.ts       # logic trọng tài 90s
│  │     │  ├─ draw-session.ts       # logic 15s + gọi classifier
│  │     │  ├─ classifier.ts         # singleton model + warmup + hàng đợi
│  │     │  └─ labels.ts             # allowlist + tên tiếng Việt + luật accept
│  │     └─ lib/
│  │        ├─ prng.ts
│  │        └─ rate-limit.ts
│  └─ web/
│     ├─ package.json
│     ├─ vite.config.ts              # proxy /api -> :8787 khi dev
│     ├─ index.html
│     └─ src/
│        ├─ main.tsx  App.tsx  styles.css
│        ├─ routes/     Home.tsx MathGame.tsx DrawGame.tsx Leaderboard.tsx Admin.tsx
│        ├─ components/ Countdown.tsx LeaderboardTable.tsx ResultModal.tsx DrawCanvas.tsx
│        └─ lib/        api.ts sse.ts strokes.ts useCountdown.ts
├─ packages/
│  └─ shared/
│     ├─ package.json
│     └─ src/
│        ├─ types.ts                 # Session, LeaderboardRow, ...
│        ├─ schemas.ts               # zod: validate mọi request body
│        ├─ raster.ts                # ⭐ rasterizer ĐÃ HIỆU CHỈNH (dùng cả server + test)
│        └─ labels.ts                # allowlist + LUẬT_ACCEPT
├─ scripts/
│  ├─ prefetch-model.mjs             # tải model vào ./models để chạy OFFLINE
│  ├─ eval-model.mjs                 # đo accuracy từng class trên data thật -> sinh allowlist
│  ├─ loadtest.mjs                   # giả lập N người chơi
│  └─ seed-demo.mjs                  # bơm dữ liệu giả để thử bảng xếp hạng
└─ models/                           # cache ONNX (gitignore)
```

---

## 3. Data model (`apps/server/src/db/schema.sql`)

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,          -- uuid v4 (server sinh)
  game          TEXT NOT NULL,             -- 'math' | 'draw'
  player_name   TEXT NOT NULL,
  client_token  TEXT,                      -- chống 1 máy chơi liên tục
  started_at    INTEGER NOT NULL,          -- ⏱ epoch ms DO SERVER GHI
  ends_at       INTEGER NOT NULL,          -- ⏱ started_at + 90000 | 15000
  finished_at   INTEGER,
  score         INTEGER NOT NULL DEFAULT 0,-- ⭐ server tự tính, KHÔNG nhận từ client
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count   INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER NOT NULL DEFAULT 0,-- thời điểm câu đúng cuối (tie-break)
  status        TEXT NOT NULL DEFAULT 'active', -- active|finished|expired|flagged
  meta          TEXT,                      -- JSON (target label, ...)
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS math_questions (
  session_id  TEXT    NOT NULL,
  idx         INTEGER NOT NULL,   -- 0..N
  prompt      TEXT    NOT NULL,   -- "17 + 25"
  answer      INTEGER NOT NULL,
  issued_at   INTEGER,            -- server ghi khi trả câu cho client
  given       INTEGER,            -- client trả lời gì
  answered_at INTEGER,
  is_correct  INTEGER,
  PRIMARY KEY (session_id, idx)
);

CREATE TABLE IF NOT EXISTS draw_frames (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT    NOT NULL,
  seq        INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  top_label  TEXT, top_score REAL, matched INTEGER
);

CREATE INDEX IF NOT EXISTS idx_lb_math ON sessions(game, status, score DESC, duration_ms ASC);
CREATE INDEX IF NOT EXISTS idx_lb_draw ON sessions(game, status, score DESC, duration_ms ASC);
CREATE INDEX IF NOT EXISTS idx_frames    ON draw_frames(session_id, seq);
```

---

## 4. Thiết kế chống gian lận (phần bạn yêu cầu rõ)

Nguyên tắc duy nhất: **client chỉ là màn hình + bàn phím. Mọi con số quyết định do server giữ.**

| # | Nguy cơ | Cách chặn (server-side) |
|---|---|---|
| 1 | Sửa đồng hồ đếm ngược ở DevTools | Server ghi `started_at`/`ends_at` lúc tạo session. Mọi request đều check `Date.now() <= ends_at`. Client chỉ **hiển thị** lại, sửa cũng vô nghĩa. |
| 2 | Gửi thẳng điểm lên server | **API không có field `score`.** Server tự đếm số câu đúng của chính nó. Body chứa `score` → bỏ qua. |
| 3 | Spam đáp án (bot) | Rate limit: mỗi câu phải cách nhau ≥ **250ms** (server đo bằng `issued_at`). Nhanh hơn → từ chối + ghi cờ `flagged`. |
| 4 | Tự sinh câu hỏi dễ | Câu hỏi sinh **server-side**, lưu sẵn vào `math_questions` khi tạo session. Client không biết câu tiếp theo. |
| 5 | Trả lời sau khi hết giờ | `answered_at > ends_at` → đánh `expired`, **không** cộng điểm dù đúng. |
| 6 | Chơi lại nhiều lần để lấy điểm cao | `client_token` (localStorage) + cờ `flagged`; BTC quyết định ở trang Admin. |
| 7 | Fake ảnh vẽ (gửi PNG có sẵn) | Client gửi **stroke thô**; server **tự rasterize**. Ảnh không bao giờ đi qua mạng. |
| 8 | Gửi frame dày để spam model | Tối thiểu **1000ms** giữa 2 frame (server đo); vượt → 429. |
| 9 | Gian lận thời gian game vẽ | `timeToSolve = received_at − started_at`, server đo. Điểm tính từ số này. |
| 10 | Sửa keyword mục tiêu | Keyword chọn server-side, lưu trong `sessions.meta`; client chỉ nhận chữ để hiển thị. |

### 4.1 Luồng API Game 1 — Tính nhanh

```
POST /api/math/sessions           { playerName, clientToken }
  → server: tạo session, sinh sẵn 60 câu, started_at=now, ends_at=now+90s
  ← { sessionId, endsAt, serverNow, question: { idx, prompt } }      # KHÔNG gửi answer

POST /api/math/sessions/:id/answer { idx, value }
  → server kiểm tra: session active? now<=ends_at? now-issued_at>=250ms? idx khớp câu hiện tại?
  → đúng  → score += 1, duration_ms = now - started_at
  → trả   ← { correct, score, question: { idx+1, prompt } } | { finished: true }
  # câu kế tiếp CHỈ được trả sau khi đã trả lời câu hiện tại

POST /api/math/sessions/:id/finish {}   → chốt sổ, trả { score, correct, wrong, durationMs }
GET  /api/leaderboard?game=math         → top 20, ORDER BY score DESC, duration_ms ASC
GET  /api/leaderboard/stream?game=math  → SSE: đẩy bảng mới mỗi khi có người chơi xong
```

### 4.2 Luồng API Game 2 — Vẽ hình

```
POST /api/draw/sessions           { playerName, clientToken }
  → server: chọn keyword từ ALLOWLIST, started_at=now, ends_at=now+15s
  ← { sessionId, target: { id, labelVi }, endsAt, serverNow }

POST /api/draw/sessions/:id/frame { seq, strokes: [[[x,y],...],...], canvasW, canvasH }
  → server: kiểm tra thời gian + rate limit 1000ms
  → rasterize(strokes) → 28×28 Uint8Array      (packages/shared/src/raster.ts)
  → classifier.classify(px) → top3 [{label, score}]
  → matched = LUAT_ACCEPT(top3, target)
  ← { matched, top: [{label, labelVi, score}], timeLeftMs }
  → nếu matched: chốt session, score = round(timeLeftMs/1000 * 10), status='finished'
```

**Trải nghiệm người chơi:** luôn hiển thị AI đang "đoán" gì theo thời gian thực (`AI nghĩ: con mèo 62%`) — vừa minh bạch, vừa vui, vừa giúp người chơi tự chỉnh nét vẽ.

---

## 5. Code cốt lõi (đã kiểm chứng bằng spike)

### 5.1 `packages/shared/src/raster.ts` — rasterizer ĐÃ HIỆU CHỈNH

Cấu hình `boxFrac=0.85, lineWidth=1.5, ss=4` cho **70.3% top-1 / 95.3% top-3** (đo thật).

```ts
// Vẽ stroke -> 28x28 Uint8Array, 1 kênh, 255 = NÉT, 0 = NỀN  (đúng polarity QuickDraw)
export const RASTER = { size: 28, ss: 4, boxFrac: 0.85, lineWidth: 1.5 } as const;

export type Stroke = readonly (readonly [number, number])[];

export function rasterize(strokes: Stroke[], cfg = RASTER): Uint8Array {
  const { size, ss, boxFrac, lineWidth } = cfg;
  const BIG = size * ss;
  const g = new Float32Array(BIG * BIG).fill(255);          // nền trắng

  const put = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= BIG || yi >= BIG) return;
    const i = yi * BIG + xi;
    if (g[i] > 0) g[i] = 0;                                  // nét đen
  };
  const seg = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(2, Math.ceil(d * 2));
    const r = w / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      for (let dy = -r; dy <= r; dy += 0.5)
        for (let dx = -r; dx <= r; dx += 0.5)
          if (dx * dx + dy * dy <= r * r) put(cx + dx, cy + dy);
    }
  };

  // 1) bbox toàn bộ nét
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const [x, y] of s) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) return new Uint8Array(size * size);   // canvas trống

  // 2) scale GIỮ TỈ LỆ, đưa cạnh dài thành boxFrac*BIG, canh giữa
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const side = Math.max(w, h);
  const scale = (boxFrac * BIG) / side;
  const offX = (BIG - w * scale) / 2 - minX * scale;
  const offY = (BIG - h * scale) / 2 - minY * scale;
  const lw = lineWidth * ss;                                  // ⚠️ 1.5 là đã hiệu chỉnh, đổi là tụt accuracy

  for (const s of strokes) {
    for (let i = 0; i < s.length - 1; i++) {
      seg(s[i][0] * scale + offX, s[i][1] * scale + offY,
          s[i + 1][0] * scale + offX, s[i + 1][1] * scale + offY, lw);
    }
    if (s.length === 1) put(s[0][0] * scale + offX, s[0][1] * scale + offY);
  }

  // 3) downsample box-filter rồi ĐẢO -> 255 = nét
  const out = new Uint8Array(size * size);
  const n = ss * ss;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) sum += g[(y * ss + j) * BIG + (x * ss + i)];
    out[y * size + x] = 255 - Math.round(sum / n);
  }
  return out;
}
```

> ⚠️ **3 cái bẫy đã sập trong spike — đừng sập lại:**
> 1. **Polarity:** QuickDraw là **nét sáng (255) trên nền đen (0)**. Nếu xuất nền trắng/nét đen thì accuracy sụp về gần 0 (đã thử: 0/10).
> 2. **Raw ndjson là dạng CỘT:** `drawing[i] = [xs[], ys[], ts[]]`, **không phải** `[[x,y,t],...]`. Script eval phải transpose, nếu không sẽ lặng lẽ cho 0%.
> 3. **Độ dày nét:** 1.5px @28×28 = 70%; 2.5px = 19%. Đừng "chỉnh cho đẹp".

### 5.2 `apps/server/src/services/classifier.ts` — singleton + hàng đợi

```ts
import { pipeline, RawImage, env, type ImageClassificationPipeline } from '@huggingface/transformers';

env.cacheDir = process.env.MODEL_CACHE_DIR ?? './models';      // cho phép chạy OFFLINE
if (process.env.MODEL_OFFLINE === '1') { env.allowRemoteModels = false; }

export const MODEL_ID = 'JoshuaKelleyDs/quickdraw-MobileVITV2-2.0-Finetune';

let pipe: ImageClassificationPipeline | null = null;
let chain: Promise<unknown> = Promise.resolve();

export async function loadModel(): Promise<void> {
  if (pipe) return;
  pipe = await pipeline('image-classification', MODEL_ID, { dtype: 'fp32' }) as ImageClassificationPipeline;
  // warmup: chạy 3 lần cho ONNX cấp phát arena + JIT trước khi đông người
  const blank = new RawImage(new Uint8Array(784), 28, 28, 1);
  for (let i = 0; i < 3; i++) await pipe(blank, { top_k: 3 });
}

export type Prediction = { label: string; score: number };

/** Ép tuần tự: onnxruntime-node chạy native, xếp hàng để không nổ CPU khi đông người. */
export function classify(px: Uint8Array, topK = 3): Promise<Prediction[]> {
  const run = async () => {
    if (!pipe) throw new Error('model not loaded');
    const res = await pipe(new RawImage(px, 28, 28, 1), { top_k: topK });
    return (Array.isArray(res) ? res : [res]) as Prediction[];
  };
  const out = chain.then(run, run);
  chain = out.catch(() => { });     // hàng đợi không bị kẹt khi 1 request lỗi
  return out;
}
```

### 5.3 `packages/shared/src/labels.ts` — allowlist + luật chấp nhận

```ts
// Sinh bằng `node scripts/eval-model.mjs` — CHỈ đưa vào game những class model làm tốt.
export const ALLOWLIST = [
  'circle','house','star','envelope','apple','cat','fish','tree','sun','cloud',
  'car','flower','clock','bicycle','key','cup','hat','pencil','book','moon',
  'banana','chair','umbrella','eye','hand','snowman','lollipop','donut','mushroom','cake',
] as const;

// Tên tiếng Việt để hiển thị cho người chơi (nhận diện vẫn theo nhãn tiếng Anh)
export const LABEL_VI: Record<string, string> = {
  circle: 'hình tròn', house: 'cái nhà', star: 'ngôi sao', envelope: 'phong bì',
  apple: 'quả táo', cat: 'con mèo', fish: 'con cá', tree: 'cái cây',
  sun: 'mặt trời', cloud: 'đám mây', car: 'ô tô', flower: 'bông hoa',
  clock: 'đồng hồ', bicycle: 'xe đạp', key: 'cái chìa khoá', cup: 'cái cốc',
  hat: 'cái mũ', pencil: 'bút chì', book: 'quyển sách', moon: 'mặt trăng',
  /* ... bổ sung dần ... */
};

// Những cặp hay bị nhầm lẫn -> chấp nhận luôn cho đỡ ức chế người chơi
export const ALSO_ACCEPT: Record<string, string[]> = {
  circle: ['moon', 'sun', 'octagon', 'oval'],
  sun:    ['circle', 'star', 'flower'],
  fish:   ['shark', 'whale'],
  cat:    ['dog', 'tiger'],
};

/** Đo thật: top-1 70%, top-3 95% -> chấp nhận top-3 (có điều kiện) để ~95% người chơi được công nhận. */
export function accepted(top: { label: string; score: number }[], target: string): boolean {
  if (top[0]?.label === target) return true;
  const inTop3 = top.slice(0, 3).some(p => p.label === target);
  if (inTop3 && top[0].score < 0.85) return true;              // model chưa chắc -> nới tay
  return (ALSO_ACCEPT[target] ?? []).includes(top[0]?.label);
}
```

### 5.4 `apps/server/src/services/math-session.ts` — trọng tài

```ts
const ANSWER_MIN_GAP_MS = 250;

export function submitAnswer(db, id: string, idx: number, value: number, now = Date.now()) {
  const s = getSession(db, id);
  if (!s) return { error: 'not_found' as const };
  if (s.status !== 'active') return { error: 'inactive' as const };

  // 1) hết giờ?  -> không bao giờ cộng điểm, kể cả đúng
  if (now > s.ends_at) { finalize(db, id, now); return { finished: true as const }; }

  const q = getQuestion(db, id, idx);
  if (!q) return { error: 'bad_index' as const };

  // 2) rate limit: chặn bot bấm nhanh hơn người
  const prev = now - (q.issued_at ?? 0);
  if (prev < ANSWER_MIN_GAP_MS) { flag(db, id, 'too_fast'); return { error: 'too_fast' as const }; }

  // 3) chấm điểm ở SERVER, không tin client
  const isCorrect = q.answer === value ? 1 : 0;
  recordAnswer(db, id, idx, value, now, isCorrect);

  // 4) PHẢI trả lời câu hiện tại mới được nhận câu kế tiếp
  const next = getQuestion(db, id, idx + 1);
  if (!next) { finalize(db, id, now); return { finished: true as const }; }

  issueQuestion(db, id, idx + 1, now);
  return { correct: !!isCorrect, score: getScore(db, id), question: { idx: next.idx, prompt: next.prompt } };
}
```

### 5.5 Bảng xếp hạng (`queries.ts`)

```ts
export const leaderboard = (db, game: string, limit = 20) =>
  db.prepare(`
    SELECT player_name AS player, score, duration_ms, finished_at
    FROM sessions
    WHERE game = ? AND status IN ('finished','flagged')
    ORDER BY score DESC, duration_ms ASC
    LIMIT ?
  `).all(game, limit);
```

> **Tie-break:** điểm bằng nhau → ai trả lời đúng **câu cuối sớm hơn** (`duration_ms` nhỏ hơn) xếp trên. Với game vẽ, `duration_ms` = thời gian giải xong → giải nhanh hơn xếp trên.

---

## 6. Kế hoạch thực thi theo task

### Phase 0 — Khung dự án (làm trước, ~30 phút)

**Task 0.1 — Khởi tạo workspace**

```bash
cd /d/Side/Clubday
npm init -y
# sửa package.json: "private": true, "workspaces": ["apps/*", "packages/*"], "type": "module"
mkdir -p apps/server/src apps/web/src packages/shared/src scripts models
```

`D:\Side\Clubday\tsconfig.base.json`:
```json
{ "compilerOptions": {
  "target": "ES2023", "module": "NodeNext", "moduleResolution": "NodeNext",
  "strict": true, "skipLibCheck": true, "esModuleInterop": true,
  "resolveJsonModule": true, "verbatimModuleSyntax": true
}}
```

*Kiểm tra:* `npm ls --workspaces` chạy không lỗi.

**Task 0.2 — Cài dependency**

```bash
npm i -w apps/server fastify @fastify/static @fastify/cors zod @huggingface/transformers --no-audit
npm i -w apps/server -D typescript tsx vitest @types/node
npm i -w apps/web react react-dom --no-audit
npm i -w apps/web -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
npm i -D typescript
```

*Kiểm tra:* `node -e "import('@huggingface/transformers').then(m=>console.log('ok', typeof m.pipeline))"` → `ok function`.

**Task 0.3 — Ghi `packages/shared/src/raster.ts`** (code ở §5.1) + `src/labels.ts` (§5.3) + `src/types.ts`, export qua `packages/shared/package.json` (`"exports": { ".": "./src/index.ts" }`).

**Task 0.4 — Test rasterizer (TDD, viết TRƯỚC khi làm UI)**
- `packages/shared/src/raster.test.ts`: (a) mảng rỗng → toàn 0; (b) 1 nét ngang giữa canvas → có pixel ≥200 ở hàng giữa, và **không** có pixel nét ở 2 hàng đầu; (c) đối xứng: nét dọc → cột giữa.
- *Kiểm tra:* `npx vitest run packages/shared` → 3 passed.

**Task 0.5 — `scripts/prefetch-model.mjs`** — tải model vào `./models` để **chạy offline ngày sự kiện**:
```js
import { pipeline, env } from '@huggingface/transformers';
env.cacheDir = './models';
await pipeline('image-classification', 'JoshuaKelleyDs/quickdraw-MobileVITV2-2.0-Finetune', { dtype: 'fp32' });
console.log('model cached -> ./models');
```
*Kiểm tra:* `node scripts/prefetch-model.mjs` rồi `ls models/` thấy file `model.onnx` 18.4MB. Sau đó **rút mạng** và chạy lại → vẫn phải OK.

---

### Phase 1 — Backend Game 1 (Tính nhanh)

**Task 1.1 — `lib/prng.ts`**: mulberry32 (seed → dãy số tất định). *Test:* cùng seed → cùng dãy.

**Task 1.2 — `services/math-gen.ts`**:
```ts
export function generateQuestions(seed: number, count = 60) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const kind = i < 10 ? 0 : Math.floor(rnd() * 4);   // 10 câu đầu chỉ cộng trừ cho khởi động
    let a, b, prompt, answer;
    if (kind === 0)      { a = 10 + Math.floor(rnd()*90); b = 1 + Math.floor(rnd()*89); prompt = `${a} + ${b}`; answer = a + b; }
    else if (kind === 1) { a = 20 + Math.floor(rnd()*80); b = 1 + Math.floor(rnd()*19); prompt = `${a} - ${b}`; answer = a - b; }
    else if (kind === 2) { a = 2  + Math.floor(rnd()*11); b = 2 + Math.floor(rnd()*11); prompt = `${a} × ${b}`; answer = a * b; }
    else                 { b = 2  + Math.floor(rnd()*11); answer = 2 + Math.floor(rnd()*11); a = b * answer; prompt = `${a} ÷ ${b}`; }
    out.push({ prompt, answer });
  }
  return out;
}
```
*Test:* 60 câu, mọi đáp án là số nguyên, phép chia luôn chia hết, cùng seed → cùng kết quả.

**Task 1.3 — `db/index.ts` + `schema.sql`** (mục §3). `openDatabase(path)` chạy schema, trả `DatabaseSync`. *Test:* mở `:memory:` → `SELECT name FROM sqlite_master` có 3 bảng.

**Task 1.4 — `db/queries.ts`**: `createSession`, `getSession`, `issueQuestion`, `recordAnswer`, `finalize`, `leaderboard`, `flag`. *Test:* tạo session → issue → answer → finalize → leaderboard trả 1 dòng đúng điểm.

**Task 1.5 — `routes/math.ts`**: 3 endpoint §4.1, validate body bằng zod. *Test:* `app.inject()` — POST sessions trả `sessionId` + `endsAt`; **assert response KHÔNG chứa `answer`**.

**Task 1.6 — Test chống gian lận (quan trọng nhất Phase 1)**
`apps/server/src/services/math-session.test.ts`:
- (a) `submitAnswer` với `now = ends_at + 1` → trả `finished`, điểm **không** tăng dù đáp án đúng.
- (b) 2 lần submit cách nhau 100ms → lần 2 trả `too_fast`, điểm không tăng, session bị `flagged`.
- (c) Body có `score: 999` → **bị bỏ qua**, điểm = số câu đúng thật.
- (d) Trả lời đúng 5 câu → `score === 5`.
*Kiểm tra:* `npx vitest run apps/server` → tất cả passed.

---

### Phase 2 — Backend Game 2 (Vẽ hình)

**Task 2.1 — `services/classifier.ts`** (§5.2) + test: load model, `classify(new Uint8Array(784))` → mảng 3 phần tử, tổng score ~1.0.

**Task 2.2 — `scripts/eval-model.mjs`**: chạy lại đúng phép đo trong spike (range-fetch `full/raw/*.ndjson`, transpose dạng cột, `rasterize`, so khớp) trên **toàn bộ 345 class × 20 mẫu**, in bảng accuracy từng class.
- *Kiểm tra:* in ra bảng; `circle/house/star/envelope` phải ≥ 0.6; **dán các class ≥ 0.65 vào `ALLOWLIST`**.
- ⭐ Đây là bước biến "model 76%" thành "trải nghiệm sự kiện không ức chế".

**Task 2.3 — `services/draw-session.ts`**: `startDrawSession`, `submitFrame` (check thời gian + rate limit 1000ms → `rasterize` → `classify` → `accepted` → finalize), `pickTarget` (random từ ALLOWLIST, loại trừ target vừa ra).

**Task 2.4 — `routes/draw.ts`**: `POST /sessions`, `POST /sessions/:id/frame` per §4.2; zod validate `strokes` là mảng các mảng `[number, number]`, **giới hạn ≤ 2000 điểm** (chống payload rác).

**Task 2.5 — Test:** (a) frame sau `ends_at` → từ chối; (b) 2 frame cách 200ms → 429; (c) stroke của hình tròn + target `circle` → `matched: true` (dùng mẫu stroke thật trong fixture); (d) canvas trống → `matched:false`, không crash.

---

### Phase 3 — Frontend

**Task 3.1 — `apps/web/vite.config.ts`**: plugin react + `server.proxy['/api'] = 'http://localhost:8787'`. *Kiểm tra:* `npm run dev -w apps/web` lên được trang mặc định.

**Task 3.2 — `routes/Home.tsx`**: nhập tên + chọn game; lưu `playerName`/`clientToken` vào `localStorage`.

**Task 3.3 — `lib/useCountdown.ts`**: đếm ngược dựa trên `endsAt` **của server**, hiệu chỉnh lệch đồng hồ bằng `serverNow` lúc tạo session (`offset = serverNow - Date.now()`). Đây là chi tiết chống "đổi giờ máy" ở phía hiển thị.

**Task 3.4 — `routes/MathGame.tsx`**: hiển thị phép toán, `<input inputMode="numeric">` + Enter, gọi `submitAnswer`, cộng điểm, chuyển câu. Thanh thời gian + điểm + streak. Hết giờ → `ResultModal` + link bảng xếp hạng.

**Task 3.5 — `lib/strokes.ts`**: bắt `pointerdown/move/up` trên canvas → mảng stroke `[x,y]` theo toạ độ CSS px. **Bắt buộc** `touch-action: none` + `setPointerCapture` để vẽ được trên điện thoại.

**Task 3.6 — `components/DrawCanvas.tsx` + `routes/DrawGame.tsx`**: canvas + từ khoá tiếng Việt + đếm ngược 15s; `setInterval` 1000ms → gửi `strokes` (đã gộp, bỏ nét trùng); hiển thị "AI nghĩ: …" từ response; `matched` → màn hình thắng.

**Task 3.7 — `routes/Leaderboard.tsx` + `lib/sse.ts`**: fetch top 20 + `EventSource('/api/leaderboard/stream')`, tự nối lại.

**Task 3.8 — `routes/Admin.tsx`**: nhập mã `ADMIN_TOKEN` → nút reset bảng, xoá session `flagged`, chế độ "màn hình lớn" (bảng xếp hạng cỡ to cho máy chiếu).

**Task 3.9 — `app.ts`**: `@fastify/static` phục vụ `apps/web/dist`, `setNotFoundHandler` trả `index.html` cho route client.

---

### Phase 4 — Sự kiện & chịu tải

**Task 4.1 — `scripts/seed-demo.mjs`**: bơm 50 session giả (điểm ngẫu nhiên) → thử bảng xếp hạng + tie-break.

**Task 4.2 — `scripts/loadtest.mjs`**: giả lập **N người chơi đồng thời**:
- 30 client vừa trả lời Toán (1 câu/1.5s) **vừa** gửi frame Vẽ (1 frame/1.2s) trong 60s.
- In: p50/p95 latency từng endpoint, số request lỗi, RSS của server theo thời gian.
- *Ngưỡng chấp nhận:* p95 `/frame` **< 400ms**, 0 lỗi 5xx, RSS **< 1.5GB**.
- *Nếu trượt:* tăng chu kỳ frame lên 1.5s, hoặc chạy classifier trong `worker_threads` pool (xem Rủi ro #2).

**Task 4.3 — `scripts/prefetch-model.mjs` + chạy offline** (đã có ở 0.5) — nhắc lại vì đây là **điểm chết người ngày sự kiện**.

**Task 4.4 — Diễn tập:** 3–5 người thật chơi cùng lúc trên Wi-Fi thật, 2 vòng liên tiếp.

---

## 7. Checklist ngày sự kiện

```bash
# 1. Build
cd /d/Side/Clubday
npm run build -w apps/web          # -> apps/web/dist
npm run build -w apps/server       # tsc -> apps/server/dist

# 2. Chạy (KHÔNG cần internet nếu đã prefetch model)
MODEL_CACHE_DIR=./models MODEL_OFFLINE=1 ADMIN_TOKEN=<mã-bí-mật> \
  node apps/server/dist/index.js
# -> listening on http://0.0.0.0:8787

# 3. Kiểm tra sức khoẻ
curl -s localhost:8787/api/health          # {"ok":true,"model":"ready","db":"ok"}
```

- [ ] Lấy IP máy chủ (`ipconfig`) → in QR code trỏ `http://<IP>:8787` dán ở khu vực chơi.
- [ ] Cắm sạc laptop, tắt sleep/hibernate + Windows Update.
- [ ] Mở sẵn `http://localhost:8787/admin` ở chế độ màn hình lớn trên máy chiếu.
- [ ] Diễn tập 3 người thật: 1 ván Toán + 1 ván Vẽ, xác nhận điểm lên bảng.
- [ ] Chạy `node scripts/loadtest.mjs 30 60` xác nhận p95 < 400ms.
- [ ] Tắt mạng ngoài, chạy lại server → xác nhận model vẫn load (offline thật).
- [ ] Chuẩn bị phương án B: nếu Wi-Fi sập → chơi Toán bằng cách **cùng máy** (nhiều tab), hoặc đọc điểm qua màn hình BTC.
- [ ] Backup `clubday.db` sau sự kiện (`cp clubday.db clubday.$(date +%F).db`).

---

## 8. Rủi ro & cách xử lý

| # | Rủi ro | Mức | Xử lý |
|---|---|---|---|
| 1 | **Model accuracy thấp hơn kỳ vọng khi người thật vẽ** | Cao | Đã đo: top-1 70%, top-3 95%. Giảm thiểu: (a) chỉ cho class trong ALLOWLIST đã eval ≥0.65; (b) chấp nhận top-3 + bảng `ALSO_ACCEPT`; (c) hiện live "AI nghĩ gì" để người chơi tự chỉnh; (d) Task 2.2 là bước **bắt buộc**, không bỏ. |
| 2 | **43+ người vẽ cùng lúc → nghẽn CPU** (mỗi frame 33ms; 30 người × 1 frame/1.2s ≈ 25 frame/s ≈ 0.8 core, nhưng p95 73ms làm dồn hàng) | Trung bình | Hàng đợi tuần tự trong `classifier.ts` (§5.2); **Task 4.2 load test trước**; nếu trượt → `worker_threads` pool 2–4 worker hoặc giãn chu kỳ frame. |
| 3 | Không có internet ở sự kiện → model không tải được | Cao (chết game) | `scripts/prefetch-model.mjs` + `MODEL_OFFLINE=1` (§7). **Bắt buộc chạy thử với mạng đã rút.** |
| 4 | Wi-Fi sự kiện chập chờn | Trung bình | Server nội bộ (không qua internet); SSE tự reconnect; game Toán chịu được mất mạng ngắn vì đếm ngược tính từ `endsAt` của server; chuẩn bị phương án B. |
| 5 | `node:sqlite` là API **experimental** | Thấp | Đã chạy thử OK trên Node 24.13. Bọc trong `db/index.ts` để đổi sang `better-sqlite3` chỉ ở **1 file** nếu Node đổi API. |
| 6 | Người chơi thao tác mất thời gian (nhập tên, chọn game) | Thấp | Lưu tên vào `localStorage`; QR sẵn; route `/math` và `/draw` vào thẳng game. |
| 7 | Tranh chấp bảng xếp hạng | Thấp | Mọi câu trả lời/frame đều lưu DB → BTC tra được `math_questions` của bất kỳ session nào. |

---

## 9. Định nghĩa "xong"

- [ ] `npm test` xanh toàn bộ (test chống gian lận §Task 1.6 phải pass).
- [ ] Chơi được 2 game end-to-end trên **điện thoại thật** qua Wi-Fi LAN.
- [ ] Bảng xếp hạng cập nhật realtime, tie-break đúng.
- [ ] `eval-model.mjs` đã sinh ALLOWLIST (không dùng danh sách mặc định).
- [ ] Load test 30 người: p95 `/frame` < 400ms, 0 lỗi 5xx.
- [ ] Server chạy được **khi đã rút mạng**.
- [ ] Thử được: sửa `endsAt` trong DevTools → điểm không thay đổi; gửi `score: 999` → bị bỏ qua.

---

## 10. Câu hỏi cần bạn chốt trước khi code

1. **Gửi stroke hay base64 ảnh?** (mục 1.1 ① — đề xuất: **stroke**).
2. **Số người chơi đồng thời tối đa** dự kiến? (để chọn cấu hình load test: 10 / 30 / 50+).
3. **Bao nhiêu máy chủ?** Đề xuất 1 laptop BTC. Nếu muốn 2 máy → cần thêm bước đồng bộ DB.
4. **Game Vẽ: ghi điểm thế nào?** Đề xuất `score = 150 − số_giây_đã_dùng` (giải càng nhanh điểm càng cao).
5. **Thể lệ xếp hạng:** riêng từng game, hay có "vô địch toàn năng" cộng dồn 2 game?
6. **Nội dung hiển thị:** chỉ tiếng Việt, hay song ngữ?

---

**Ghi chú phạm vi:** plan này *không* bao gồm: đăng nhập/tài khoản, nhiều phòng chơi song song, lưu lịch sử dài hạn, mobile app riêng, CI/CD. Đều là YAGNI cho 1 sự kiện 1 ngày.
