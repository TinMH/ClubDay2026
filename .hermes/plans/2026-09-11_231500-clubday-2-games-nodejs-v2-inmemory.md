# ClubDay — Web 2 trò chơi cho sự kiện (Node.js) — Plan v2

> **v2 thay thế v1** (`2026-09-11_223902-...`). Thay đổi lớn: **bỏ hoàn toàn database** → lưu trong RAM theo *lượt (round)* 5 người.
> **Nguồn gốc plan:** `D:\Side\Clubday`

**Goal:** Web app 2 game cho sự kiện CLB — mỗi **lượt tối đa 5 người**: (1) *Tính nhanh* 90s, (2) *Vẽ hình nhanh* 15s nhận diện AI. Chơi xong → hiện **dashboard của đúng 5 người đó**.

**Kiến trúc:** **1 process Node.js** (Fastify) giữ model AI nóng trong RAM + giữ luôn toàn bộ lượt chơi trong RAM. Không database, không Docker, không Python, không native module ngoài `onnxruntime-node`.

**Tech stack:** Node 24 · Fastify 5 · `@huggingface/transformers` · React 19 + Vite · SSE.

---

## 0. Vì sao bỏ được database (và bỏ được cái gì)

Yêu cầu của bạn là: *nhập tên → thi với nhau → xem kết quả 5 người đó*. Đây là dữ liệu **phù du theo lượt**, không phải dữ liệu tích luỹ. Nên:

| Thứ trong v1 | v2 | Ghi chú |
|---|---|---|
| Bảng `sessions` | `Map<roundId, Round>` trong RAM | Không SQL, không schema, không migration |
| Bảng `math_questions` | Mảng `Question[]` trên object Round | Sinh 1 lần khi bắt đầu lượt |
| Bảng `draw_frames` | `Player.lastPrediction` | Chỉ cần kết quả mới nhất, không cần log |
| `CREATE INDEX` + `ORDER BY` | `Array.sort()` trên 5 phần tử | 1 dòng code |
| `node:sqlite` | **bỏ luôn** | Còn đúng **1 native dep**: `onnxruntime-node` |

**Được:** ít hơn ~4 bảng, ~8 hàm query, không file `.db`, không lo khoá file, không lo WAL.
**Mất:** nếu server **crash/restart giữa lúc chơi** thì lượt đang chơi mất. Với sự kiện 1 ngày, chấp nhận được — và có bù bằng 20 dòng snapshot JSON (mục 3.3) nếu bạn muốn.

> **Nguyên tắc chống gian lận vẫn giữ nguyên 100%.** Bỏ database **không** có nghĩa là tin client: server vẫn tự giữ `startedAt`/`endsAt`, vẫn tự đếm điểm, vẫn không nhận `score` từ client.

---

## 1. Mô hình "Lượt" (Round) — thay cho database

```
  Màn hình BTC / máy chiếu          Điện thoại người chơi
  ┌──────────────────────┐          ┌────────────────────┐
  │ /admin               │          │ 1 QR CỐ ĐỊNH cả    │
  │ [Tạo lượt mới]       │          │ sự kiện → nhập tên │
  │  mã lượt: AB12CD     │          │ → tự vào lượt đang │
  │  lobby: 3/5 người    │◄── SSE ──│   mở                │
  │ [BẮT ĐẦU] (khi đủ)   │          └────────────────────┘
  │  … đang chơi …       │
  │  DASHBOARD 5 người   │
  └──────────────────────┘
```

**Vòng đời 1 lượt:** `lobby` → (BTC bấm BẮT ĐẦU) → `playing` → (hết giờ / mọi người xong) → `done` → hiện dashboard.

**✅ CHỐT: hỗ trợ CẢ HAI, mặc định là Cách A.** (quyết định của bạn)

- **Cách A — MẶC ĐỊNH:** BTC in **1 QR duy nhất** cho cả sự kiện trỏ `/`. Người chơi quét → nhập tên → **tự động vào lượt đang mở**. Lượt đầy 5 người thì báo "Lượt này đủ rồi, chờ lượt sau nhé". BTC chỉ cần bấm *Tạo lượt mới* + *BẮT ĐẦU*.
- **Cách B — ĐƯỜNG DẪN RIÊNG:** `/r/<mã>` (ví dụ `/r/AB12CD`) → cho phép **nhiều nhóm chơi song song**. Admin hiện QR của từng lượt để in/dán riêng cho từng khu vực.

Chỉ khác nhau **1 tham số**: Cách A gọi `/api/rounds/join` **không** kèm `roundId`; Cách B gọi **có** `roundId` lấy từ URL. Tầng store/API/game hoàn toàn giống nhau → không phát sinh nhánh code nào khác.

### 1.1 Đồng hồ CHUNG cho cả lượt — vừa công bằng hơn, vừa đơn giản hơn

Trong v1 tôi thiết kế mỗi người một `endsAt` riêng. Với lượt 5 người thì **một `endsAt` chung cho cả lượt** tốt hơn hẳn:

- **Công bằng:** cả 5 chơi đúng 90 giây như nhau, so điểm là so trực tiếp.
- **Đơn giản hơn:** 1 con số thời gian thay vì 5; không phải tính `duration` riêng từng người.
- **Chống gian lận dễ hơn:** chỉ cần kiểm tra `now <= round.endsAt` cho mọi request.
- **Khoá join sau khi bắt đầu:** ai vào sau khi lượt đã chạy thì bị từ chối → không ai bị thiếu thời gian.

---

## 2. Cấu trúc thư mục

```
D:\Side\Clubday\
├─ package.json                      # npm workspaces
├─ tsconfig.base.json
├─ .gitignore                        # node_modules, dist, models/, data/
├─ apps/
│  ├─ server/
│  │  ├─ package.json
│  │  └─ src/
│  │     ├─ index.ts                 # bootstrap + warmup model
│  │     ├─ app.ts                   # fastify factory (testable)
│  │     ├─ config.ts
│  │     ├─ store/
│  │     │  ├─ types.ts              # Round, Player, Question
│  │     │  ├─ store.ts              # Map + CRUD + GC  ⭐ THAY CHO DATABASE
│  │     │  ├─ lobby.ts              # tạo lượt, join, start
│  │     │  ├─ dashboard.ts          # sort 5 người -> bảng hạng
│  │     │  └─ snapshot.ts           # (tuỳ chọn) ghi JSON chống crash
│  │     ├─ routes/
│  │     │  ├─ rounds.ts             # join / start / state / dashboard
│  │     │  ├─ math.ts               # answer
│  │     │  ├─ draw.ts               # frame
│  │     │  ├─ stream.ts             # SSE
│  │     │  └─ admin.ts              # tạo lượt, reset, mã ADMIN_TOKEN
│  │     ├─ services/
│  │     │  ├─ math-gen.ts           # sinh câu hỏi (PRNG seed)
│  │     │  ├─ math-session.ts       # trọng tài Tính nhanh
│  │     │  ├─ draw-session.ts       # trọng tài Vẽ
│  │     │  └─ classifier.ts         # model singleton + hàng đợi
│  │     └─ lib/  prng.ts  rate-limit.ts  id.ts
│  └─ web/
│     └─ src/
│        ├─ routes/  Home.tsx  Lobby.tsx  MathGame.tsx  DrawGame.tsx  Dashboard.tsx  Admin.tsx
│        ├─ components/  Countdown.tsx  RankTable.tsx  DrawCanvas.tsx  JoinCard.tsx
│        └─ lib/  api.ts  sse.ts  strokes.ts  useCountdown.ts
├─ packages/shared/src/
│  ├─ raster.ts                      # ⭐ rasterizer ĐÃ HIỆU CHỈNH (mục 4)
│  ├─ labels.ts                      # allowlist + tên tiếng Việt + luật accept
│  ├─ schemas.ts                     # zod
│  └─ types.ts
├─ scripts/
│  ├─ prefetch-model.mjs
│  ├─ eval-model.mjs
│  └─ loadtest.mjs
└─ models/                           # cache ONNX (gitignore)
```

---

## 3. Code cốt lõi — thay thế database

### 3.1 `store/types.ts`

```ts
export type GameKind = 'math' | 'draw';
export type RoundStatus = 'lobby' | 'playing' | 'done';
export interface Question { prompt: string; answer: number }

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  ready: boolean;
  score: number;
  correct: number;
  wrong: number;
  // Tính nhanh
  qIndex: number;           // đang ở câu số mấy
  lastAnswerAt: number;     // ⏱ server ghi, để rate-limit
  // Vẽ hình
  seq: number;
  lastFrameAt: number;      // ⏱ server ghi, để rate-limit
  solved: boolean;
  solvedAt: number | null;  // thời điểm giải xong (tie-break)
  lastGuess: { label: string; score: number } | null;
  flagged: boolean;         // có dấu hiệu bất thường
}

export interface Round {
  id: string;                            // 6 ký tự = luôn là join code
  game: GameKind;
  status: RoundStatus;
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;                 // ⏱ 1 ĐỒNG HỒ CHUNG cho cả lượt
  players: Map<string, Player>;
  questions: Question[] | null;          // math: sinh sẵn khi start
  target: { id: string; labelVi: string } | null;  // draw
  version: number;                       // tăng mỗi lần đổi → SSE phát khi đổi
}

export const MAX_PLAYERS = 5;
export const DURATION_MS: Record<GameKind, number> = { math: 90_000, draw: 15_000 };
```

### 3.2 `store/store.ts` — toàn bộ "database"

```ts
import { randomBytes } from 'node:crypto';
import type { Round, GameKind, RoundStatus } from './types.js';

const rounds = new Map<string, Round>();
const playersById = new Map<string, { roundId: string; playerId: string }>();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ I,O,0,1 cho dễ đọc
export const newId = (n = 6) =>
  Array.from(randomBytes(n), b => ALPHABET[b % ALPHABET.length]).join('');

export const getRound = (id: string) => rounds.get(id.toUpperCase()) ?? null;
export const allRounds = () => [...rounds.values()];
export const touch = (r: Round) => { r.version++; };

/** Lượt đang mở để người chơi mới nhảy vào (Cách A: 1 QR duy nhất). */
export function openRound(game: GameKind): Round {
  for (const r of rounds.values())
    if (r.game === game && r.status === 'lobby' && r.players.size < MAX_PLAYERS) return r;
  return createRound(game);
}

export function createRound(game: GameKind): Round {
  const r: Round = {
    id: newId(), game, status: 'lobby', createdAt: Date.now(),
    startedAt: null, endsAt: null, players: new Map(),
    questions: null, target: null, version: 0,
  };
  rounds.set(r.id, r);
  return r;
}

export function addPlayer(r: Round, name: string) {
  const p = {
    id: newId(8), name: name.trim().slice(0, 20) || 'Ẩn danh',
    joinedAt: Date.now(), ready: true,
    score: 0, correct: 0, wrong: 0,
    qIndex: 0, lastAnswerAt: 0, seq: 0, lastFrameAt: 0,
    solved: false, solvedAt: null, lastGuess: null, flagged: false,
  };
  r.players.set(p.id, p);
  playersById.set(p.id, { roundId: r.id, playerId: p.id });
  touch(r);
  return p;
}

export const findPlayer = (playerId: string) => {
  const loc = playersById.get(playerId);
  if (!loc) return null;
  const round = rounds.get(loc.roundId);
  const player = round?.players.get(playerId);
  return round && player ? { round, player } : null;
};

/** Dọn lượt cũ: giữ RAM phẳng suốt sự kiện dài. */
export function startGc(keepMs = 2 * 60 * 60 * 1000) {
  return setInterval(() => {
    const now = Date.now();
    for (const [id, r] of rounds)
      if (r.status === 'done' && now - (r.endsAt ?? r.createdAt) > keepMs) {
        for (const pid of r.players.keys()) playersById.delete(pid);
        rounds.delete(id);
      }
  }, 5 * 60_000).unref();
}
```

### 3.3 `store/snapshot.ts` — 20 dòng, TUỲ CHỌN (chống crash)

Không có database thì nếu server restart giữa sự kiện là mất lượt đang chơi. 20 dòng này bù lại:

```ts
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';

const FILE = 'data/rounds.json';
export const save = (rounds: Round[]) =>
  writeFileSync(FILE, JSON.stringify(rounds.map(r => ({ ...r, players: [...r.players.values()] }))));
export const load = (): Round[] => {
  if (!existsSync(FILE)) return [];
  try { return JSON.parse(readFileSync(FILE, 'utf8')).map(r => ({ ...r, players: new Map(r.players.map((p: Player) => [p.id, p])) })); }
  catch { return []; }
};
```

Gọi `save(allRounds())` mỗi khi một lượt `done` (và mỗi 5s lúc đang chơi), `load()` lúc boot. **Bỏ được nếu bạn thấy không cần.**

### 3.4 `store/dashboard.ts` — thay cho `ORDER BY score DESC`

```ts
import type { Round } from './types.js';

export function dashboard(r: Round) {
  const started = r.startedAt ?? r.createdAt;
  return [...r.players.values()]
    .sort((a, b) =>
      b.score - a.score ||                                   // 1) điểm cao hơn
      (a.solvedAt ?? a.lastAnswerAt ?? 0) - (b.solvedAt ?? b.lastAnswerAt ?? 0) || // 2) xong sớm hơn
      a.joinedAt - b.joinedAt)                               // 3) vào sớm hơn
    .map((p, i) => ({
      rank: i + 1,
      name: p.name,
      score: p.score,
      correct: p.correct,
      wrong: p.wrong,
      msToFinish: (p.solvedAt ?? p.lastAnswerAt) ? (p.solvedAt ?? p.lastAnswerAt)! - started : null,
      flagged: p.flagged,
    }));
}
```

> Hết. `ORDER BY score DESC, duration_ms ASC` của v1 giờ là **1 dòng `.sort()`** trên mảng 5 phần tử.

---

## 4. Rasterizer — giữ nguyên bản đã hiệu chỉnh (quan trọng nhất)

Phần này **không đổi** so với v1, vì nó đã được **đo thật**: `boxFrac=0.85, lineWidth=1.5, ss=4` → **70.3% top-1 / 95.3% top-3** trên dữ liệu QuickDraw thật.

```ts
export const RASTER = { size: 28, ss: 4, boxFrac: 0.85, lineWidth: 1.5 } as const;
export type Stroke = readonly (readonly [number, number])[];

// 255 = NÉT, 0 = NỀN  (đúng polarity QuickDraw — sai cái này là accuracy về ~0)
export function rasterize(strokes: Stroke[], cfg = RASTER): Uint8Array {
  const { size, ss, boxFrac, lineWidth } = cfg;
  const BIG = size * ss;
  const g = new Float32Array(BIG * BIG).fill(255);
  const put = (x: number, y: number) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= BIG || yi >= BIG) return;
    const i = yi * BIG + xi; if (g[i] > 0) g[i] = 0;
  };
  const seg = (x0: number, y0: number, x1: number, y1: number, w: number) => {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(2, Math.ceil(d * 2)), r = w / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
      for (let dy = -r; dy <= r; dy += 0.5)
        for (let dx = -r; dx <= r; dx += 0.5)
          if (dx * dx + dy * dy <= r * r) put(cx + dx, cy + dy);
    }
  };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) for (const [x, y] of s) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!isFinite(minX)) return new Uint8Array(size * size);
  const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
  const scale = (boxFrac * BIG) / Math.max(w, h);
  const offX = (BIG - w * scale) / 2 - minX * scale;
  const offY = (BIG - h * scale) / 2 - minY * scale;
  const lw = lineWidth * ss;          // ⚠️ 1.5 đã hiệu chỉnh — đổi là tụt accuracy (2.5 -> 19%)
  for (const s of strokes) {
    for (let i = 0; i < s.length - 1; i++)
      seg(s[i][0] * scale + offX, s[i][1] * scale + offY,
          s[i + 1][0] * scale + offX, s[i + 1][1] * scale + offY, lw);
    if (s.length === 1) put(s[0][0] * scale + offX, s[0][1] * scale + offY);
  }
  const out = new Uint8Array(size * size), n = ss * ss;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) sum += g[(y * ss + j) * BIG + (x * ss + i)];
    out[y * size + x] = 255 - Math.round(sum / n);
  }
  return out;
}
```

**Model (đo thật, 200 mẫu QuickDraw thật / 20 class):**

| Model + **dtype** | Top-1 | Top-3 | p50 | Kết luận |
|---|---|---|---|---|
| `Xenova/quickdraw-mobilevit-small` @ **fp32** | **82.5%** | 95.0% | **3ms** | ✅ **CHỌN** |
| `JoshuaKelleyDs/quickdraw-MobileVITV2-2.0-Finetune` @ fp32 | 81.5% | 95.5% | 7ms | dự phòng (tương đương) |
| `Xenova/quickdraw-mobilevit-small` @ **q8** | **7.0%** | 14% | 4ms | ❌ **TUYỆT ĐỐI TRÁNH** |
| `Xenova/quickdraw-mobilevit-small` @ fp16 | — | — | — | ❌ **load lỗi** |

> 🔴 **CẢNH BÁO QUAN TRỌNG NHẤT CỦA PLAN NÀY: luôn dùng `dtype: 'fp32'`.**
> Cùng một bộ weights: **fp32 = 82.5%**, nhưng **q8 = 7.0%** — tức là nén q8 **âm thầm phá nát model**
> (chance = 0.29%, nên 7% vẫn là gần như vô dụng). Nó **không báo lỗi gì**: load bình thường, chạy 4ms,
> trả về kết quả sai một cách rất tự tin.
> `dtype: 'q8'` là lựa chọn rất hay được dùng để tiết kiệm RAM → **đừng dùng ở đây.**
> `dtype: 'fp16'` thì **không load được** (onnxruntime từ chối node LayerNorm đã convert).
>
> **Trong code luôn ghi rõ `{ dtype: 'fp32' }` kèm comment "đã đo, không đổi"** — đừng để pipeline()
> tự lấy default của thư viện, default có thể đổi theo version.

Hai model đầu **tương đương nhau** trong phép đo này (chênh 1% trên 200 mẫu = nhiễu). Chọn Xenova vì
nhanh gấp đôi (3ms vs 7ms) và là model chuẩn của Transformers.js. Đổi sang JoshuaK cũng không sao —
nhưng **bất kể chọn model nào, dtype phải là fp32**.

*(Lưu ý về độ tin cậy: phép đo trên chỉ phủ 20 class. Chỉ JoshuaK có công bố eval trên đủ 345 class
(76.22%) — dùng con số 76% để tính toán an toàn.)*

---

## 5. API (đơn giản hơn v1 vì không còn DB)

### 5.1 Lượt & lobby

```
POST /api/admin/rounds              { game }          (header x-admin-token)
  → tạo lượt mới, trả { roundId }
POST /api/rounds/join               { name, game?, roundId? }
  → không có roundId  = Cách A: tự vào lượt đang mở (hoặc tạo nếu chưa có)
  → có roundId        = Cách B: vào đúng lượt
  → trả { playerId, roundId, game }  |  409 nếu lượt đã đủ 5 hoặc đã bắt đầu
POST /api/rounds/:id/start          {}                (header x-admin-token)
  → startedAt=now, endsAt=now+DURATION, sinh câu hỏi / chọn keyword, status='playing'
GET  /api/rounds/:id/state          → snapshot cho client (status, players, timeLeftMs, …)
GET  /api/rounds/:id/stream         → SSE: đẩy mỗi khi round.version đổi
GET  /api/rounds/:id/dashboard      → dashboard() 5 người
```

### 5.2 Tính nhanh

```
POST /api/rounds/:id/answer   { playerId, idx, value }
  → kiểm tra: status==='playing'? now<=endsAt? now-lastAnswerAt>=250ms? idx đúng câu hiện tại?
  → đúng → player.score++, player.lastAnswerAt = now
  → trả { correct, score, question: { idx+1, prompt } } | { finished: true }
  # KHÔNG có field `score` trong request — server tự đếm
```

### 5.3 Vẽ hình

```
POST /api/rounds/:id/frame    { playerId, seq, strokes, canvasW, canvasH }
  → kiểm tra thời gian + now-lastFrameAt>=1000ms
  → rasterize(strokes) → classify() → accepted(top3, target)
  → trả { matched, top:[{label,labelVi,score}], timeLeftMs }
  → matched → player.solved=true, solvedAt=now, score = round(timeLeftMs/1000*10)
```

### 5.4 Khi nào lượt kết thúc?

`now > round.endsAt` **HOẶC** tất cả người chơi đã xong (`solved` với game vẽ, hoặc hết câu với game toán) → `status='done'`, phát SSE, client hiện **Dashboard 5 người**.

---

## 6. Chống gian lận (giữ nguyên nguyên tắc, đã đơn giản hoá)

| # | Nguy cơ | Cách chặn |
|---|---|---|
| 1 | Sửa đồng hồ đếm ngược | Server giữ `round.startedAt`/`endsAt`; client chỉ hiển thị. Mọi request check `now <= endsAt`. |
| 2 | Gửi điểm lên server | **API không có field `score`**. Server tự đếm `player.score`. |
| 3 | Spam đáp án | `now - player.lastAnswerAt >= 250ms`, vượt → 429 + `flagged = true`. |
| 4 | Tự sinh câu hỏi dễ | Câu hỏi sinh server-side, lưu `round.questions`. |
| 5 | Trả lời sau khi hết giờ | `now > endsAt` → không cộng điểm dù đúng. |
| 6 | Vào lượt sau khi đã bắt đầu | `status !== 'lobby'` → từ chối join (công bằng: không ai bị thiếu giờ). |
| 7 | Fake ảnh vẽ | Client gửi **stroke thô**, server **tự rasterize**. Ảnh không qua mạng. |
| 8 | Spam model | `now - player.lastFrameAt >= 1000ms` → 429. |
| 9 | Sửa keyword | Keyword chọn server-side ở `round.target`. |
| 10 | Đăng ký 5 slot rồi treo | `round.endsAt` luôn chạy; BTC bấm *Bỏ qua* ở admin để kết thúc sớm. |

---

## 7. Kế hoạch thực thi

### Phase 0 — Khung dự án

**Task 0.1 — Workspace**
```bash
cd /d/Side/Clubday
npm init -y   # sửa: "private": true, "workspaces": ["apps/*","packages/*"], "type": "module"
mkdir -p apps/server/src/store apps/server/src/routes apps/server/src/services apps/server/src/lib \
         apps/web/src/routes apps/web/src/components apps/web/src/lib \
         packages/shared/src scripts models
```
*Kiểm tra:* `npm ls --workspaces` không lỗi.

**Task 0.2 — Dependency** (chú ý: **không** cài SQLite nữa)
```bash
npm i -w apps/server fastify @fastify/static @fastify/cors zod @huggingface/transformers --no-audit
npm i -w apps/server -D typescript tsx vitest @types/node
npm i -w apps/web react react-dom --no-audit
npm i -w apps/web -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
```
*Kiểm tra:* `node -e "import('@huggingface/transformers').then(m=>console.log(typeof m.pipeline))"` → `function`.

**Task 0.3 — `packages/shared/src/raster.ts`** (code mục 4) + `labels.ts` + `schemas.ts` + `types.ts`.

**Task 0.4 — Test rasterizer (viết TRƯỚC UI)**
`raster.test.ts`: (a) mảng rỗng → toàn 0; (b) nét ngang giữa → có pixel ≥200 ở hàng giữa, không có ở 2 hàng đầu; (c) nét dọc → cột giữa; (d) độ dày nét tăng → số pixel nét tăng.
*Kiểm tra:* `npx vitest run packages/shared` → 4 passed.

**Task 0.5 — `scripts/prefetch-model.mjs`** (chạy OFFLINE ngày sự kiện)
```js
import { pipeline, env } from '@huggingface/transformers';
env.cacheDir = './models';
// ⚠️ dtype 'fp32' là BẮT BUỘC — q8 làm accuracy sụp 82.5% -> 7.0%, fp16 không load được.
//    Đã đo, không đổi. Xem mục 4.
await pipeline('image-classification', MODEL_ID, { dtype: 'fp32' });
console.log('model cached -> ./models');
```
`MODEL_ID` khai báo 1 chỗ duy nhất trong `packages/shared/src/model.ts`:
```ts
// Đã đo trên 200 mẫu thật: chọn model nào cũng được, miễn dtype = fp32.
export const MODEL_ID = 'Xenova/quickdraw-mobilevit-small';
export const MODEL_DTYPE = 'fp32' as const;   // ⚠️ đổi giá trị này = phải chạy lại eval-model.mjs
```
*Kiểm tra:* chạy xong → `ls models/` có `model.onnx` 18.4MB → **rút mạng, chạy lại vẫn phải OK**.

---

### Phase 1 — Lượt & Lobby (nền tảng, không có DB)

**Task 1.1 — `store/types.ts` + `lib/id.ts`** (mục 3.1) — `newId()` loại bỏ ký tự dễ nhầm I/O/0/1.

**Task 1.2 — `store/store.ts`** (mục 3.2): `createRound`, `openRound`, `addPlayer`, `getRound`, `findPlayer`, `startGc`.
*Test:* tạo lượt → `openRound` trả về **đúng lượt đó** (không tạo mới); thêm 5 người → `openRound` tạo **lượt mới**; `addPlayer` thứ 6 → ném lỗi.

**Task 1.3 — `store/lobby.ts`**: `join(name, { game, roundId })` (check đủ 5 / đã bắt đầu), `start(roundId)` (set `startedAt`/`endsAt`, sinh câu hỏi hoặc chọn keyword, `status='playing'`).
*Test:* join sau `start` → lỗi `ROUND_STARTED`; join khi đủ 5 → lỗi `ROUND_FULL`.

**Task 1.4 — `store/dashboard.ts`** (mục 3.4). *Test:* 5 người điểm `[3,7,7,1,7]` → xếp `7(ms nhỏ) , 7 , 7 , 3 , 1`; tie-break đúng.

**Task 1.5 — `routes/rounds.ts`**: `join`, `start`, `state`, `dashboard` + zod validate. *Test:* `app.inject()` POST join → 200 + `playerId`; join lần 6 → 409.

**Task 1.6 — `routes/stream.ts` (SSE)**: mỗi round 1 kênh; `setInterval` 500ms so `round.version`, đổi thì `data: {...}\n\n`; `request.raw.on('close')` → clear. *Test:* curl `-N` thấy event khi có người join.

---

### Phase 2 — Game 1: Tính nhanh

**Task 2.1 — `lib/prng.ts`** (mulberry32). *Test:* cùng seed → cùng dãy.

**Task 2.2 — `services/math-gen.ts`**: sinh 60 câu, 10 câu đầu chỉ cộng/trừ khởi động; chia luôn chia hết; nhân/chia trong bảng 2–11. *Test:* đáp án luôn nguyên, `a ÷ b` luôn hết, cùng seed → cùng kết quả.

**Task 2.3 — `services/math-session.ts`**: `submitAnswer(roundId, playerId, idx, value, now)` theo mục 5.2.

**Task 2.4 — `routes/math.ts`**.

**Task 2.5 — Test chống gian lận (quan trọng nhất Phase 2)**
- (a) `now = endsAt + 1` → không cộng điểm dù đúng, trả `finished`.
- (b) 2 lần cách 100ms → lần 2 bị 429, `flagged = true`, điểm không đổi.
- (c) Body có `score: 999` → **bị bỏ qua**.
- (d) Trả lời đúng 5 câu → `score === 5`.
- (e) Đồng hồ **chung**: `endsAt` bằng nhau cho cả 5 người.
*Kiểm tra:* `npx vitest run apps/server` xanh.

**Task 2.6 — `services/math-session.ts`: kết thúc lượt**: `now > endsAt` hoặc mọi người hết câu → `status='done'`, phát SSE.

---

### Phase 3 — Game 2: Vẽ hình

**Task 3.1 — `services/classifier.ts`**: singleton + warmup 3 lần lúc boot + **hàng đợi tuần tự** (chống nghẽn CPU khi 5 người vẽ cùng lúc).

```ts
let pipe: ImageClassificationPipeline | null = null;
let chain: Promise<unknown> = Promise.resolve();
export async function loadModel() {
  if (pipe) return;
  pipe = await pipeline('image-classification', MODEL_ID, { dtype: 'fp32' }) as ImageClassificationPipeline;
  const blank = new RawImage(new Uint8Array(784), 28, 28, 1);
  for (let i = 0; i < 3; i++) await pipe(blank, { top_k: 3 });     // warmup
}
export function classify(px: Uint8Array, topK = 3): Promise<Prediction[]> {
  const run = async () => (await pipe!(new RawImage(px, 28, 28, 1), { top_k: topK })) as Prediction[];
  const out = chain.then(run, run);
  chain = out.catch(() => { });         // 1 request lỗi không làm kẹt hàng đợi
  return out;
}
```

**Task 3.2 — `scripts/eval-model.mjs`** ⭐ BẮT BUỘC, không bỏ: chạy lại phép đo trong spike (range-fetch `full/raw/*.ndjson` → **transpose dạng cột** `[xs[],ys[],ts[]]` → `rasterize` → so khớp) trên 345 class × 20 mẫu. In bảng accuracy, **chỉ đưa class ≥ 0.65 vào ALLOWLIST**.
*Kiểm tra:* `circle/house/star/envelope` ≥ 0.6; ALLOWLIST sinh ra từ số đo thật.

**Task 3.3 — `services/draw-session.ts`**: `pickTarget()` (random từ ALLOWLIST, tránh lặp target vừa rồi), `submitFrame()`.

**Task 3.4 — `routes/draw.ts`** + zod giới hạn `strokes` ≤ 2000 điểm (chống payload rác).

**Task 3.5 — Test:** (a) frame sau `endsAt` → từ chối; (b) 2 frame cách 200ms → 429; (c) stroke hình tròn + target `circle` → `matched: true` (fixture stroke thật); (d) canvas trống → không crash.

---

### Phase 4 — Frontend

**Task 4.1 — `vite.config.ts`**: proxy `/api` → `http://localhost:8787`.

**Task 4.2 — `Home.tsx` + `JoinCard.tsx`**: 1 ô nhập tên + nút *Vào chơi*; lưu `playerId` + `roundId` vào `localStorage`; 409 → "Lượt này đủ 5 người rồi, chờ lượt sau nhé".
- **Quyết định đường vào** (1 trong 2, cùng 1 component):
  - route `/` → gọi `/api/rounds/join` **không kèm `roundId`** → Cách A (tự vào lượt đang mở).
  - route `/r/:code` → gọi kèm `roundId = code.toUpperCase()` → Cách B (vào đúng lượt của khu vực đó).
- Đọc `roundId` từ URL bằng `useParams()`; nếu có thì hiện thêm dòng "Bạn đang vào lượt **AB12CD**".

**Task 4.3 — `Lobby.tsx`**: hiện 5 slot, tên ai đã vào (SSE realtime), "Đang chờ BTC bắt đầu…".

**Task 4.4 — `useCountdown.ts`**: đếm ngược từ `endsAt` **của server**, hiệu chỉnh lệch giờ bằng `serverNow` lúc join (`offset = serverNow - Date.now()`).

**Task 4.5 — `MathGame.tsx`**: phép toán to rõ + `<input inputMode="numeric">` + Enter; điểm/streak; thanh thời gian. Hết giờ → `Dashboard`.

**Task 4.6 — `strokes.ts`**: `pointerdown/move/up` → mảng `[x,y]` theo CSS px; **bắt buộc** `touch-action: none` + `setPointerCapture` để vẽ được trên điện thoại.

**Task 4.7 — `DrawCanvas.tsx` + `DrawGame.tsx`**: canvas + từ khoá tiếng Việt + 15s; `setInterval` 1000ms gửi stroke (bỏ nét trùng); hiện "AI nghĩ: con mèo 62%"; `matched` → màn hình thắng.

**Task 4.8 — `Dashboard.tsx`**: bảng hạng 5 người — hạng, tên, điểm, đúng/sai, thời gian; 🥇🥈🥉 cho 3 đầu; tự cập nhật qua SSE; nút *Chơi lại* → về Home.

**Task 4.9 — `Admin.tsx`** (`x-admin-token`): *Tạo lượt mới* (chọn game) + hiện mã lượt & QR; *BẮT ĐẦU*; *Bỏ qua lượt*; danh sách lượt gần đây; **chế độ màn hình lớn** cho máy chiếu (đây là màn hình chính của BTC).

**Task 4.10 — `app.ts`**: `@fastify/static` phục vụ `apps/web/dist`; `setNotFoundHandler` trả `index.html`.

---

### Phase 5 — Sự kiện & chịu tải

**Task 5.1 — `scripts/loadtest.mjs`**: giả lập **5 người/lượt × nhiều lượt song song**: mỗi người vừa trả lời Toán (1 câu/1.5s) vừa gửi frame Vẽ (1 frame/1.2s); in p50/p95 từng endpoint + RSS.
*Ngưỡng:* p95 `/frame` **< 400ms**, 0 lỗi 5xx, RSS **< 1.5GB**.
*Nếu trượt:* giãn frame lên 1.5s, hoặc `worker_threads` pool 2–4 worker.

**Task 5.2 — Diễn tập:** 5 người thật, 2 lượt liên tiếp, cả 2 game.

---

## 8. Checklist ngày sự kiện

```bash
cd /d/Side/Clubday
npm run build -w apps/web && npm run build -w apps/server

MODEL_CACHE_DIR=./models MODEL_OFFLINE=1 ADMIN_TOKEN=<mã-bí-mật> \
  node apps/server/dist/index.js
# -> http://0.0.0.0:8787

curl -s localhost:8787/api/health   # {"ok":true,"model":"ready","rounds":0}
```
- [ ] `ipconfig` lấy IP → in **1 QR cố định** trỏ `http://<IP>:8787` dán ở khu vực chơi (Cách A).
- [ ] Mở `http://localhost:8787/admin` ở chế độ màn hình lớn trên máy chiếu.
- [ ] Cắm sạc, tắt sleep/hibernate + Windows Update.
- [ ] Diễn tập 1 lượt 5 người thật: join → lobby → BẮT ĐẦU → cả 2 game → dashboard.
- [ ] Rút mạng ngoài, chạy lại server → model vẫn load (offline thật).
- [ ] `node scripts/loadtest.mjs` xác nhận p95 < 400ms.
- [ ] Phương án B nếu Wi-Fi sập: BTC mở sẵn 5 tab trên máy chiếu, người chơi lên bấm trực tiếp.
- [ ] Snapshot `data/rounds.json` (nếu bật) copy ra USB sau sự kiện.

---

## 9. Rủi ro

| # | Rủi ro | Mức | Xử lý |
|---|---|---|---|
| 1 | **Model kém khi người thật vẽ** | Cao | Đo thật: top-1 70% / top-3 95%. Giảm thiểu: ALLOWLIST sinh từ `eval-model.mjs`; chấp nhận top-3 + `ALSO_ACCEPT`; hiện "AI nghĩ gì". |
| 2 | **Mất lượt nếu server restart** (hệ quả của bỏ DB) | Thấp | Snapshot JSON 20 dòng (mục 3.3) — bật nếu muốn chắc. Sự kiện 1 ngày, restart gần như không xảy ra. |
| 3 | 5 người vẽ cùng lúc → dồn hàng đợi | Thấp | Chỉ 5 frame/giây (mỗi người 1 frame/1.2s → ~4 frame/s ≈ 0.13 core). Hàng đợi tuần tự trong `classifier.ts`; load test trước. |
| 4 | Không có internet → model không tải được | Cao (chết game) | `prefetch-model.mjs` + `MODEL_OFFLINE=1`. **Bắt buộc thử khi đã rút mạng.** |
| 5 | Người chơi vào muộn bị thiếu giờ | Thấp | Chặn join khi `status !== 'lobby'` (mục 6 #6). |
| 6 | 5 slot bị chiếm nhưng người không chơi | Thấp | Admin có nút *Bỏ qua lượt*; GC dọn lượt cũ sau 2h. |

---

## 10. Định nghĩa "xong"

- [ ] `npm test` xanh (đặc biệt test chống gian lận Task 2.5).
- [ ] 1 lượt 5 người chơi được **cả 2 game** trên điện thoại thật qua Wi-Fi LAN.
- [ ] Dashboard hiện đúng 5 người, tie-break đúng, tự cập nhật realtime.
- [ ] `eval-model.mjs` đã sinh ALLOWLIST (không dùng danh sách mặc định).
- [ ] Load test: p95 `/frame` < 400ms, 0 lỗi 5xx.
- [ ] Server chạy được **khi đã rút mạng**.
- [ ] Thử gian lận: sửa `endsAt` trong DevTools → điểm không đổi; gửi `score: 999` → bị bỏ qua; join thứ 6 → 409.

---

## 11. Quyết định — ĐÃ CHỐT

| # | Câu hỏi | **Chốt** |
|---|---|---|
| 1 | Người chơi vào lượt thế nào? | ✅ **Cả hai.** Mặc định **Cách A** (`/` → tự vào lượt đang mở); giữ thêm `/r/<mã>` cho **Cách B**. Khác nhau đúng 1 tham số `roundId`. |
| 2 | Bắt đầu lượt tự động hay BTC bấm? | **BTC bấm** — kiểm soát nhịp sự kiện, công bằng (không ai bị bắt đầu khi đang còn loay hoay). |
| 3 | Lượt đầy 5 nhưng có người không vào? | BTC bấm *BẮT ĐẦU* **bất cứ lúc nào với ≥ 1 người**. Không có timeout tự động. |
| 4 | Bật snapshot JSON chống crash? | **Có, bật** — chỉ 20 dòng (mục 3.3), không ảnh hưởng luồng nào khác. Rẻ hơn nhiều so với mất 1 lượt giữa sự kiện. |
| 5 | Game Vẽ ghi điểm thế nào? | `score = 150 − số_giây_đã_dùng` (giải càng nhanh điểm càng cao; tối đa 150, tối thiểu 0). |
| 6 | 1 lượt chơi mấy game? | **1 lượt = 1 game.** Người chơi đổi game bằng cách vào lượt mới. Giữ logic sạch, dashboard đọc được ngay. |

> Tất cả đã được **gài sẵn vào các task tương ứng** ở Phase 0–5 — không cần quyết gì thêm trước khi code.
