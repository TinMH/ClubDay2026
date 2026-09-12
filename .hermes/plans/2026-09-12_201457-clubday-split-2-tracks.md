# ClubDay — Plan chia 2 track song song (Tính nhanh ‖ Vẽ hình nhanh)

> **Plan này là bản điều phối công việc.** Nó chia việc để **2 người làm song song không xung đột**.
> Đặc tả kỹ thuật đầy đủ (kiến trúc, chống gian lận, hằng số đã đo, checklist sự kiện) vẫn nằm ở
> `.hermes/plans/2026-09-11_231500-clubday-2-games-nodejs-v2-inmemory.md` — **đọc file đó trước**.
> File này không lặp lại đặc tả, chỉ nói **ai làm gì, file nào của ai**.

---

## 1. Vì sao plan cũ không chia song song được

Plan v2 tổ chức **theo tầng**:

```
Phase 1 (store) → Phase 2 (math) → Phase 3 (draw) → Phase 4 (frontend) → Phase 5 (test)
```

Cách này tốt cho **một** người, nhưng nếu 2 người làm thì cả hai đều phải sửa cùng những file:

| File dùng chung | Vì sao cả 2 đụng vào |
|---|---|
| `store/types.ts` | A cần thêm `qIndex`, `lastAnswerAt`; B cần thêm `solved`, `lastFrameAt` |
| `app.ts` | Mỗi người đăng ký route của mình |
| `App.tsx` | Mỗi người thêm màn hình của mình |
| `package.json` | Mỗi người thêm dependency của mình |
| `README.md` | Mỗi người viết tài liệu cho game mình |

Kết quả: conflict liên tục, và tệ hơn là **conflict ở `types.ts`** — loại conflict khó nhất vì nó ảnh
hưởng cả hai phía cùng lúc.

## 2. Cách chia mới: 3 nguyên tắc

### Nguyên tắc 1 — Khoá hợp đồng trước (freeze the contract)

Phase F viết xong `store/types.ts` với **đủ field cho CẢ HAI game**. Sau đó **không ai được sửa file
đó nữa**. Mỗi người chỉ đọc, không ghi.

Đây là mấu chốt: biến "file dùng chung" thành "file đã đóng băng".

### Nguyên tắc 2 — Chia theo file, không chia theo tầng

Mỗi track sở hữu **lát cắt dọc hoàn chỉnh**: route + service + trang UI của game mình. Không track
nào làm "nửa dưới" hay "nửa trên" cả.

### Nguyên tắc 3 — Nền tảng tạo sẵn file rỗng cho cả hai

Phase F tạo sẵn `routes/math.ts`, `routes/draw.ts`, `MathGame.tsx`, `DrawGame.tsx` là **stub rỗng**
và đăng ký chúng vào `app.ts` / `App.tsx` / router. Nhờ vậy `app.ts` và `App.tsx` chỉ bị sửa **một
lần duy nhất**, bởi người làm nền tảng. Hai dev chỉ việc mở file rỗng của mình và viết vào.

---

## 3. Bảng phân quyền file (quan trọng nhất tài liệu này)

### 🔒 NỀN TẢNG — Phase F, **1 người viết**, sau đó KHÔNG AI SỬA

| File | Nội dung |
|---|---|
| `apps/server/src/config.ts` | PORT, ADMIN_TOKEN, đường dẫn cache |
| `apps/server/src/store/types.ts` | ⭐ `Round`, `Player` — **đủ field cho cả 2 game** |
| `apps/server/src/store/store.ts` | `Map` + CRUD + `openRound` + GC |
| `apps/server/src/store/lobby.ts` | `createRound` / `join` / `start` / `syncRoundStatus` |
| `apps/server/src/store/dashboard.ts` | xếp hạng 5 người |
| `apps/server/src/store/snapshot.ts` | ghi/đọc JSON chống crash |
| `apps/server/src/routes/rounds.ts` | join / start / state / dashboard |
| `apps/server/src/routes/stream.ts` | SSE |
| `apps/server/src/routes/admin.ts` | tạo lượt, bỏ qua lượt |
| `apps/server/src/lib/prng.ts` | mulberry32 — **dùng chung cả 2** |
| `apps/server/src/lib/id.ts` | mã lượt 6 ký tự |
| `apps/server/src/lib/rate-limit.ts` | hàm thuần: `tooFast(last, now, minGap)` |
| `apps/server/src/app.ts` | factory + **đăng ký sẵn cả 2 route** |
| `apps/server/src/index.ts` | bootstrap |
| `apps/web/src/App.tsx` | router + **đăng ký sẵn cả 2 màn hình** |
| `apps/web/src/routes/Home.tsx` | nhập tên (hỗ trợ `/` và `/r/:code`) |
| `apps/web/src/routes/Lobby.tsx` | 5 slot, chờ BTC |
| `apps/web/src/routes/Play.tsx` | ⭐ **dispatcher**: đọc `round.game` → render `MathGame` hoặc `DrawGame` |
| `apps/web/src/routes/Dashboard.tsx` | bảng hạng |
| `apps/web/src/routes/Admin.tsx` | màn hình BTC |
| `apps/web/src/components/Countdown.tsx` | đồng hồ đếm ngược |
| `apps/web/src/components/RankTable.tsx` | bảng hạng dùng lại |
| `apps/web/src/lib/api.ts` | fetch wrapper |
| `apps/web/src/lib/sse.ts` | EventSource + tự nối lại |
| `apps/web/src/lib/useCountdown.ts` | hook đếm ngược theo `endsAt` của server |
| `.env.example`, `README.md` | |

> 💡 `Play.tsx` là mẹo quan trọng: nó là **màn hình duy nhất** biết cả 2 game. Nhờ nó mà
> `App.tsx` không cần biết `MathGame`/`DrawGame` tồn tại, và 2 dev không đụng nhau ở router.

### 🅰️ TRACK A — TÍNH NHANH (người A sở hữu 100%)

| File | Ghi chú |
|---|---|
| `apps/server/src/services/math-gen.ts` + `.test.ts` | ⚡ thuần toán — **không phụ thuộc store** |
| `apps/server/src/services/math-session.ts` + `.test.ts` | trọng tài: đồng hồ, rate-limit, chấm điểm |
| `apps/server/src/routes/math.ts` | thay ruột file stub |
| `apps/web/src/routes/MathGame.tsx` | thay ruột file stub |
| `apps/web/src/components/AnswerPad.tsx` | ô nhập đáp án |

### 🅱️ TRACK B — VẼ HÌNH NHANH (người B sở hữu 100%)

| File | Ghi chú |
|---|---|
| `apps/server/src/raster.ts` + `.test.ts` | ⚡ thuần xử lý ảnh — **không phụ thuộc store** |
| `apps/server/src/labels.ts` | allowlist + tên tiếng Việt + luật accept |
| `apps/server/src/services/classifier.ts` | model singleton + warmup + hàng đợi |
| `apps/server/src/services/draw-session.ts` + `.test.ts` | trọng tài: chọn từ khoá, chấm điểm |
| `apps/server/src/routes/draw.ts` | thay ruột file stub |
| `scripts/eval-model.mjs` | đo accuracy từng class → sinh allowlist |
| `apps/web/src/routes/DrawGame.tsx` | thay ruột file stub |
| `apps/web/src/components/DrawCanvas.tsx` | canvas + bắt nét |
| `apps/web/src/lib/strokes.ts` | chuyển pointer event → mảng toạ độ |

### ⚠️ VÙNG XUNG ĐỘT — và cách đã chặn

| File | Ai muốn sửa | Đã chặn bằng cách nào |
|---|---|---|
| `store/types.ts` | cả 2 | Phase F viết **đủ field**; sau đó cấm sửa |
| `app.ts` | cả 2 đăng ký route | Phase F đăng ký sẵn cả 2 (từ file stub) |
| `App.tsx` | cả 2 thêm màn hình | Phase F dùng `Play.tsx` làm dispatcher → `App.tsx` không đổi nữa |
| `package.json` | cả 2 | ✅ **Đã cài đủ dependency cho cả 2 rồi** — không ai cần sửa |
| `README.md` | cả 2 | Mỗi người chỉ sửa **mục của mình** (mục riêng, không chung dòng) |
| `.env.example` | cả 2 | Phase F viết đủ biến của cả 2 |

**Luật duy nhất cần nhớ:** *nếu bạn thấy mình cần sửa một file trong bảng 🔒, hãy dừng lại và nhắn
người kia — đó là dấu hiệu hợp đồng thiếu field.*

---

## 4. Hợp đồng đóng băng (Phase F viết ra, cả 2 cùng code theo)

### 4.1 `store/types.ts`

```ts
export type GameKind = 'math' | 'draw';
export type RoundStatus = 'lobby' | 'playing' | 'done';

export interface Question { prompt: string; answer: number }

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  score: number;
  flagged: boolean;         // dùng CHUNG — rate-limit
  finished: boolean;        // dùng CHUNG — cả 2 game set khi người chơi xong

  // ── TRACK A dùng (Tính nhanh) ──
  qIndex: number;           // đang ở câu số mấy
  lastAnswerAt: number;     // ⏱ server ghi, chống spam

  // ── TRACK B dùng (Vẽ hình) ──
  seq: number;              // số thứ tự frame
  lastFrameAt: number;      // ⏱ server ghi, chống spam
  solved: boolean;
  solvedAt: number | null;  // thời điểm giải xong — tie-break
  lastGuess: { label: string; score: number } | null;
}

export interface Round {
  id: string;                    // 6 ký tự, cũng là join code
  game: GameKind;                // ⭐ quyết định Play.tsx render game nào
  status: RoundStatus;
  createdAt: number;
  startedAt: number | null;
  endsAt: number | null;         // ⏱ MỘT đồng hồ chung cho cả lượt
  players: Map<string, Player>;
  questions: Question[] | null;  // A dùng
  target: { id: string; labelVi: string } | null;  // B dùng
  version: number;               // tăng mỗi lần đổi → SSE phát khi đổi
}

export const MAX_PLAYERS = 5;
export const DURATION_MS: Record<GameKind, number> = { math: 90_000, draw: 15_000 };
```

### 4.2 `store/store.ts` — API mà 2 track được phép gọi

```ts
export function getRound(id: string): Round | null;
export function createRound(game: GameKind): Round;
export function openRound(game: GameKind): Round;          // lượt đang mở dưới 5 người
export function addPlayer(round: Round, name: string): Player;
export function touch(round: Round): void;                 // version++ → SSE phát
export function startGc(): NodeJS.Timeout;
```

### 4.3 `store/lobby.ts`

```ts
export type JoinResult =
  | { ok: true; round: Round; player: Player }
  | { ok: false; code: 'ROUND_FULL' | 'ROUND_STARTED' | 'NOT_FOUND' };

export function join(name: string, opts?: { game?: GameKind; roundId?: string }): JoinResult;

/** Chuyển lượt sang 'done' khi hết giờ HOẶC mọi người đã finished. Cả 2 track gọi hàm này. */
export function syncRoundStatus(round: Round, now: number): void;
```

### 4.4 Chữ ký route — mỗi track tự implement trong file stub của mình

```ts
// routes/math.ts  (TRACK A)
export async function mathRoutes(app: FastifyInstance): Promise<void>;
//   POST /api/rounds/:id/answer   { playerId, idx, value }
//   → KHÔNG có field `score` trong request. Server tự đếm.

// routes/draw.ts  (TRACK B)
export async function drawRoutes(app: FastifyInstance): Promise<void>;
//   POST /api/rounds/:id/frame    { playerId, seq, strokes, canvasW, canvasH }
//   → client gửi TOẠ ĐỘ NÉT, không gửi ảnh.
```

`app.ts` (Phase F) gọi cả hai — nên chúng phải tồn tại dưới dạng stub rỗng ngay từ Phase F:

```ts
// apps/server/src/routes/math.ts — STUB do Phase F tạo, TRACK A thay ruột
export async function mathRoutes(_app: FastifyInstance): Promise<void> {
  // TRACK A: implement ở đây
}
```

### 4.5 Response shape — client/SSE dùng chung, đóng băng

```ts
export interface RoundState {
  roundId: string;
  game: GameKind;
  status: RoundStatus;
  serverNow: number;
  endsAt: number | null;
  target?: { id: string; labelVi: string };            // chỉ game draw
  players: { id: string; name: string; score: number; finished: boolean }[];
}
```

---

## 5. Thứ tự thực thi (wave)

Điểm hay: **Wave 0 chạy song song được ngay lập tức**, vì các module thuần không phụ thuộc hợp đồng.

```
Wave 0 ── song song NGAY, không cần chờ ai ──────────────────────
  Người A: math-gen.ts + test          (toán thuần, không biết gì về Round)
  Người B: raster.ts + test            (xử lý ảnh thuần)
           classifier.ts               (model singleton)
           scripts/eval-model.mjs       (đo accuracy → ALLOWLIST)

Wave 1 ── nền tảng: 1 NGƯỜI làm, người kia tiếp tục Wave 0 ──────
  config, store/*, routes/{rounds,stream,admin}, lib/*,
  app.ts, index.ts, toàn bộ màn hình chung, và STUB cho cả 2 track
  → Kết thúc Wave 1 = chốt hợp đồng. Từ đây types.ts đóng băng.

Wave 2 ── 2 track song song thật sự ─────────────────────────────
  Người A: math-session.ts + test → routes/math.ts → AnswerPad → MathGame.tsx
  Người B: labels.ts → draw-session.ts + test → routes/draw.ts
           → strokes.ts → DrawCanvas → DrawGame.tsx

Wave 3 ── tích hợp: cả 2 người ──────────────────────────────────
  load test, diễn tập 5 người thật, admin QR, checklist sự kiện
```

**Vì sao Wave 0 tách riêng:** nó chứa phần **rủi ro cao nhất** của dự án (pipeline model AI) và
**không phụ thuộc gì cả**. Người B có thể bắt tay ngay ngày đầu thay vì ngồi chờ Phase F xong.

---

## 6. Task chi tiết

### Wave 0 — Người A

**A0.1 — `services/math-gen.ts` + test**
Sinh 60 câu từ seed: 10 câu đầu chỉ cộng/trừ khởi động; nhân/chia trong bảng 2–11; phép chia luôn
chia hết. Cùng seed → cùng kết quả (dùng `lib/prng.ts` khi Phase F xong, tạm thời có thể tự viết).
*Verify:* `npx vitest run apps/server` xanh; assert mọi đáp án là số nguyên và `a ÷ b` luôn hết.

### Wave 0 — Người B

**B0.1 — `raster.ts` + test** ⭐ Dùng **nguyên xi** code trong plan v2 mục 4. Hằng số
`boxFrac 0.85 / lineWidth 1.5 / ss 4` **đã đo, không đổi**.
*Verify:* 4 test (mảng rỗng → toàn 0; nét ngang → pixel ở hàng giữa; đối xứng; nét dày hơn → nhiều pixel hơn).

**B0.2 — `services/classifier.ts`**
Singleton + warmup 3 lần + hàng đợi tuần tự. `MODEL_ID`/`MODEL_DTYPE` import từ `src/model.ts`.
*Verify:* `classify(new Uint8Array(784))` → mảng 3 phần tử, tổng score ≈ 1.0.

**B0.3 — `scripts/eval-model.mjs`** ⭐ Bắt buộc, không được bỏ.
Range-fetch `full/raw/*.ndjson` → **transpose dạng cột** `[xs[],ys[],ts[]]` → `rasterize` → so khớp,
trên 345 class × 20 mẫu. In bảng accuracy từng class.
*Verify:* `circle/house/star/envelope` ≥ 0.6; **sinh ALLOWLIST từ số đo** (không tự bịa danh sách).

### Wave 1 — Nền tảng (1 người)

**F1** `config.ts` + `.env.example` (đủ biến cho cả 2 game)
**F2** `store/types.ts` (đúng mục 4.1) **F3** `store/store.ts` **F4** `store/lobby.ts`
**F5** `store/dashboard.ts` + `snapshot.ts`
**F6** `lib/{prng,id,rate-limit}.ts`
**F7** `routes/{rounds,stream,admin}.ts` + `app.ts` (đăng ký cả 2 stub) + `index.ts`
**F8** **Stub** `routes/math.ts`, `routes/draw.ts` (rỗng, đúng chữ ký mục 4.4)
**F9** Web chung: `App.tsx` (router), `Play.tsx` (dispatcher), `Home/Lobby/Dashboard/Admin`,
`lib/{api,sse,useCountdown}.ts`, `components/{Countdown,RankTable}.tsx`
**F10** **Stub** `MathGame.tsx`, `DrawGame.tsx` (màn hình trống)

*Verify cuối Wave 1:* `npm run dev:server` lên; tạo lượt ở `/admin`, join 5 người, bấm BẮT ĐẦU,
thấy trạng thái đổi realtime ở 5 tab. **Chưa cần game nào hoạt động.**
→ **Từ đây `store/types.ts` ĐÓNG BĂNG.**

### Wave 2 — Người A (Tính nhanh)

**A2.1** `services/math-session.ts` + **test chống gian lận** (quan trọng nhất track A):
  - (a) `now = endsAt + 1` → không cộng điểm dù đúng
  - (b) 2 lần cách 100ms → `TOO_FAST`, `flagged = true`
  - (c) body có `score: 999` → bị bỏ qua
  - (d) đúng 5 câu → `score === 5`
  - (e) `syncRoundStatus` khi hết giờ → `status === 'done'`
**A2.2** `routes/math.ts` (thay ruột stub) + zod validate
**A2.3** `components/AnswerPad.tsx` — `inputMode="numeric"`, Enter để gửi
**A2.4** `routes/MathGame.tsx` — phép toán, điểm, streak, thanh thời gian; hết giờ → `/dashboard`

### Wave 2 — Người B (Vẽ hình nhanh)

**B2.1** `labels.ts` — ALLOWLIST (từ B0.3) + `LABEL_VI` + `accepted()` + `ALSO_ACCEPT`
**B2.2** `services/draw-session.ts` + test:
  - (a) frame sau `endsAt` → từ chối
  - (b) 2 frame cách 200ms → `TOO_FAST`
  - (c) stroke hình tròn + target `circle` → `matched: true` (fixture stroke thật)
  - (d) canvas trống → `matched: false`, không crash
**B2.3** `routes/draw.ts` (thay ruột stub) + zod giới hạn `strokes` ≤ 2000 điểm
**B2.4** `lib/strokes.ts` — pointer event → mảng `[x,y]`; **bắt buộc** `setPointerCapture`
**B2.5** `components/DrawCanvas.tsx` — canvas + class `draw-canvas` (`touch-action: none`)
**B2.6** `routes/DrawGame.tsx` — từ khoá tiếng Việt, đếm ngược 15s, gửi frame mỗi 1000ms,
hiện "AI nghĩ: con mèo 62%", `matched` → màn hình thắng

### Wave 3 — Tích hợp (cả 2)

**I1** `scripts/loadtest.mjs` — 5 người/lượt × nhiều lượt: Toán 1 câu/1.5s, Vẽ 1 frame/1.2s.
*Ngưỡng:* p95 `/frame` < 400ms, 0 lỗi 5xx, RSS < 1.5GB.
**I2** Diễn tập 5 người thật trên Wi-Fi thật, cả 2 game, 2 lượt liên tiếp
**I3** Admin QR + chế độ màn hình lớn (máy chiếu)
**I4** `npm run check:offline` sau khi **rút mạng**

---

## 7. Quy trình Git

```
main ──────●────────────────●──────────────●─────────────►
           │                │              │
           │  (nền tảng)    │              │
           └─ Wave 1        │              │
                            │              │
feat/math-game ─────────────┴──► PR A ─────┤
feat/draw-game ─────────────┴──► PR B ─────┤
                                           └─ Wave 3 (trên main)
```

| Quy tắc | |
|---|---|
| Nhánh | `feat/math-game` (A), `feat/draw-game` (B) |
| Trước khi bắt đầu Wave 2 | Cả 2 `git rebase main` để lấy hợp đồng đã đóng băng |
| Trong lúc làm | Rebase lên `main` mỗi ngày. **Không merge `main` vào nhánh mình** — dùng rebase cho lịch sử thẳng |
| PR | 1 PR/track, review chéo (A review PR của B và ngược lại) |
| Commit | **Tiếng Anh**, conventional commits (`feat:`, `fix:`, `test:`, `chore:`) |
| Cấm | Sửa file trong bảng 🔒. Nếu buộc phải sửa → dừng, nhắn người kia |

---

## 8. Định nghĩa "xong" cho từng track

**Track A xong khi:**
- [ ] Test chống gian lận A2.1 pass hết (đây là điều kiện cứng)
- [ ] 2 người chơi thật trên 2 điện thoại, cùng lượt, chơi được 90 giây, điểm lên dashboard
- [ ] Sửa `endsAt` trong DevTools → điểm không thay đổi
- [ ] Gửi `score: 999` → bị bỏ qua

**Track B xong khi:**
- [ ] `eval-model.mjs` đã sinh ALLOWLIST (không dùng danh sách mặc định)
- [ ] 2 người vẽ trên 2 điện thoại, AI nhận diện đúng ít nhất 1 lần
- [ ] Canvas trống không làm crash server
- [ ] Gửi 2 frame cách 200ms → bị chặn

**Cả 2 xong (Wave 3) khi:**
- [ ] Load test đạt ngưỡng
- [ ] Diễn tập 5 người thật 2 lượt liên tiếp
- [ ] `npm run check:offline` pass sau khi rút mạng

---

## 9. Nếu chỉ có 1 người làm

Vẫn dùng plan này được — thứ tự tối ưu là: **Wave 0 (B trước vì rủi ro cao) → Wave 1 → Wave 2 → Wave 3**.
Lợi ích giữ nguyên: hợp đồng đóng băng sớm giúp tránh sửa `types.ts` nhiều lần về sau.
