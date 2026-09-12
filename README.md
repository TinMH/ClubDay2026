# ClubDay

Web 2 trò chơi cho sự kiện CLB. Mỗi **lượt tối đa 5 người**, chơi xong hiện dashboard của đúng nhóm đó.

| Game | Thời lượng | Cách chơi |
|---|---|---|
| **Tính nhanh** | 90 giây | Trả lời phép toán, đúng +1 điểm |
| **Vẽ hình nhanh** | 15 giây | Vẽ theo từ khoá, model AI nhận diện |

---

## Kiến trúc tổng thể

**Một process Node.js duy nhất** chạy trên máy BTC. Không database, không Docker, không Python, không service trung gian.

```
   Điện thoại người chơi                    MÁY BTC — 1 process Node.js
   ┌──────────────────┐                     ┌──────────────────────────────────┐
   │ quét QR → nhập   │      HTTP / SSE     │  Fastify 5                       │
   │ tên → vào lượt   │ ──────────────────► │   ├── /api/rounds/*   (lobby)    │
   │                  │                     │   ├── /api/math/*     (game 1)   │
   │  ┌────────────┐  │                     │   ├── /api/draw/*     (game 2)   │
   │  │  React 19  │  │ ◄────────────────── │   ├── /api/leaderboard/stream    │
   │  │  + Vite    │  │   SSE realtime      │   └── /*  static build React     │
   │  └────────────┘  │                     │                                  │
   └──────────────────┘                     │  State các lượt: Map (RAM)       │
                                            │  Model ONNX: nóng sẵn trong RAM  │
                                            └──────────────────────────────────┘
```

Ba quyết định định hình toàn bộ source code:

1. **Một process, hai app.** Model AI (20MB) nằm thường trú trong RAM tiến trình server, inference ~3ms. Tách thành service riêng chỉ thêm một chặng HTTP và một thứ nữa để sập — không đổi lại được gì ở quy mô một sự kiện.
2. **Không database.** Mỗi lượt chơi là dữ liệu phù du: 5 người vào, chơi 90 giây, xem kết quả, xong. Không có gì cần truy vấn lịch sử, nên state nằm trong `Map` sống trong RAM. `store/` **chính là** database.
3. **Server là nguồn sự thật duy nhất.** Đồng hồ, điểm số, thứ tự câu hỏi, từ khoá cần vẽ — tất cả do server giữ. Client chỉ là màn hình + bàn phím.

---

## Tổ chức source code

### Bốn nguyên tắc

| # | Nguyên tắc | Hệ quả thực tế |
|---|---|---|
| 1 | **Phụ thuộc một chiều:** `routes → services → store` | Không bao giờ import ngược lại. Xem bảng phân tầng bên dưới. |
| 2 | **`store/` là database** | Muốn thêm dữ liệu? Thêm field vào `Round`/`Player`. **Đừng thêm ORM, đừng thêm SQL.** |
| 3 | **Hằng số đã đo thì bất khả xâm phạm** | `dtype: 'fp32'`, `lineWidth: 1.5`, `boxFrac: 0.85` — đều đã đo thực nghiệm, đổi là hỏng. Luôn kèm comment nói rõ. |
| 4 | **Client không bao giờ gửi điểm** | API không có field `score`. Server tự đếm. Đây là ràng buộc thiết kế, không phải chi tiết cài đặt. |

### Cây thư mục

`✅` = đã có · `⬜` = dự kiến · `🔒` = **nền tảng, đã đóng băng** · `🅰️`/`🅱️` = thuộc track nào

> 🔒 = file nền tảng. **Đừng sửa** — nếu thấy cần sửa, đó là dấu hiệu hợp đồng thiếu field:
> dừng lại và trao đổi với người còn lại (xem plan `split-2-tracks` mục 3).

Test đặt ngay cạnh code (`store.test.ts`, `lobby.test.ts`, `dashboard.test.ts`) — chạy `npm test`.

```
ClubDay/
│
├── apps/
│   ├── server/                    ── Backend: API + AI + state các lượt
│   │   ├── src/
│   │   │   ├── index.ts           ✅ 🔒 bootstrap: đọc .env, khôi phục snapshot, listen
│   │   │   ├── app.ts             ✅ 🔒 factory Fastify — đăng ký sẵn CẢ 2 route
│   │   │   ├── config.ts          ✅ 🔒 PORT, ADMIN_TOKEN, đường dẫn cache
│   │   │   ├── model.ts           ✅ 🔒 hằng số model — GHIM dtype fp32
│   │   │   ├── raster.ts          ⬜ 🅱️ stroke → 28×28 (hằng số đã hiệu chỉnh)
│   │   │   ├── labels.ts          ⬜ 🅱️ allowlist + tên tiếng Việt + luật accept
│   │   │   │
│   │   │   ├── store/             ── "DATABASE" — state trong RAM
│   │   │   │   ├── types.ts       ✅ 🔒 Round, Player — HỢP ĐỒNG ĐÓNG BĂNG
│   │   │   │   ├── store.ts       ✅ 🔒 Map + CRUD + pub/sub cho SSE + dọn rác
│   │   │   │   ├── state.ts       ✅ 🔒 RoundState — view-model cho REST + SSE
│   │   │   │   ├── lobby.ts       ✅ 🔒 join / start / skip / đồng hồ nền
│   │   │   │   ├── dashboard.ts   ✅ 🔒 xếp hạng 5 người
│   │   │   │   └── snapshot.ts    ✅ 🔒 ghi JSON chống mất dữ liệu khi restart
│   │   │   │
│   │   │   ├── routes/            ── HTTP: chỉ validate + gọi nghiệp vụ
│   │   │   │   ├── rounds.ts      ✅ 🔒 join / start / state / dashboard
│   │   │   │   ├── stream.ts      ✅ 🔒 SSE (tự quản socket, có keep-alive)
│   │   │   │   ├── admin.ts       ✅ 🔒 tạo lượt, bỏ qua, reset
│   │   │   │   ├── admin-guard.ts ✅ 🔒 xác thực header x-admin-token
│   │   │   │   ├── math.ts        ✅ STUB → 🅰️ Track A thay ruột
│   │   │   │   └── draw.ts        ✅ STUB → 🅱️ Track B thay ruột
│   │   │   │
│   │   │   ├── services/          ── NGHIỆP VỤ: không biết gì về HTTP
│   │   │   │   ├── math-gen.ts    ⬜ 🅰️ sinh câu hỏi (PRNG có seed)
│   │   │   │   ├── math-session.ts⬜ 🅰️ trọng tài Tính nhanh
│   │   │   │   ├── draw-session.ts⬜ 🅱️ trọng tài Vẽ
│   │   │   │   └── classifier.ts  ⬜ 🅱️ model singleton + hàng đợi
│   │   │   │
│   │   │   └── lib/               ── tiện ích thuần
│   │   │       ├── prng.ts        ✅ 🔒 mulberry32 (dùng chung 2 track)
│   │   │       ├── id.ts          ✅ 🔒 mã lượt 6 ký tự (bỏ I/O/0/1)
│   │   │       ├── rate-limit.ts  ✅ 🔒 tooFast(last, now, minGap)
│   │   │       └── health.ts      ✅ 🔒 thanh ghi health-check
│   │   │
│   │   ├── package.json           ✅
│   │   └── tsconfig.json          ✅
│   │
│   └── web/                       ── Frontend: React + Vite + Tailwind CSS 4
│       ├── src/
│       │   ├── main.tsx           ✅    điểm khởi động React
│       │   ├── App.tsx            ✅ 🔒 router — KHÔNG cần sửa khi làm game
│       │   ├── styles.css         ✅    Tailwind v4 + khối @theme
│       │   ├── routes/            ── 1 file = 1 màn hình
│       │   │   ├── Home.tsx       ✅ 🔒 nhập tên (hỗ trợ cả / và /r/:code)
│       │   │   ├── Lobby.tsx      ✅ 🔒 5 slot, chờ BTC
│       │   │   ├── Play.tsx       ✅ 🔒 dispatcher → MathGame | DrawGame
│       │   │   ├── Dashboard.tsx  ✅ 🔒 bảng hạng 5 người
│       │   │   ├── Admin.tsx      ✅ 🔒 màn hình BTC (tạo lượt, bắt đầu, URL in QR)
│       │   │   ├── MathGame.tsx   ✅ STUB → 🅰️ Track A thay ruột
│       │   │   └── DrawGame.tsx   ✅ STUB → 🅱️ Track B thay ruột
│       │   ├── components/
│       │   │   ├── Shell.tsx      ✅ 🔒 khung màn hình
│       │   │   ├── Countdown.tsx  ✅ 🔒 đồng hồ + thanh tiến độ
│       │   │   ├── RankTable.tsx  ✅ 🔒 bảng hạng
│       │   │   ├── AnswerPad.tsx  ⬜ 🅰️ ô nhập đáp án
│       │   │   └── DrawCanvas.tsx ⬜ 🅱️ canvas vẽ
│       │   └── lib/               ✅ 🔒 api · sse · useCountdown · session · types · format
│       ├── index.html             ✅
│       ├── vite.config.ts         ✅ (proxy /api → :8787 khi dev)
│       ├── package.json           ✅
│       └── tsconfig.json          ✅
│
├── scripts/                       ── Công cụ vận hành — KHÔNG thuộc runtime
│   ├── prefetch-model.ts          ✅ tải model về ./models để chạy offline
│   ├── check-offline.ts           ✅ chặn internet, xác nhận model vẫn load được
│   ├── smoke-test.mjs             ✅ chạy thử nền tảng end-to-end (18 kiểm tra)
│   ├── eval-model.mjs             ⬜ 🅱️ đo accuracy từng class → sinh allowlist
│   └── loadtest.mjs               ⬜ giả lập N người chơi đồng thời
│
├── .hermes/plans/                 ── Tài liệu thiết kế (plan v2 là bản chuẩn)
├── README.md                      ✅ file này
├── package.json                   ✅ npm workspaces + script gốc
├── tsconfig.base.json             ✅ cấu hình TS dùng chung
└── models/                        📦 cache ONNX (~20MB) — KHÔNG commit
```

### Server: bốn tầng và ranh giới

Đây là phần quan trọng nhất cần hiểu. Mỗi tầng chỉ được biết những gì trong cột "Biết":

| Tầng | Thư mục | Biết | **KHÔNG được biết** |
|---|---|---|---|
| **HTTP** | `routes/` | `req`/`reply`, zod schema, mã lỗi | luật chơi, `Map`, cấu trúc `Round` |
| **Nghiệp vụ** | `services/` | luật chơi, thời gian, model AI | `req`/`reply`, Fastify, HTTP status |
| **Trạng thái** | `store/` | `Round`/`Player`, `Map`, GC | HTTP, luật chơi, model AI |
| **Tiện ích** | `lib/` | tham số đầu vào | mọi thứ khác (hàm thuần) |

**Phép thử nhanh:** nếu bạn cần `import fastify` bên trong `services/` hoặc `store/`, tức là code đang đặt sai tầng.

Lợi ích cụ thể: `services/math-session.ts` nhận `now` như một **tham số** thay vì gọi `Date.now()` bên trong — nhờ vậy test chống gian lận có thể giả lập "đã hết giờ" mà không cần chờ 90 giây thật.

### Web: ba tầng

| Tầng | Thư mục | Vai trò |
|---|---|---|
| **Màn hình** | `routes/` | 1 file = 1 màn hình. Ghép component + gọi API. |
| **UI** | `components/` | Component tái dùng, không gọi API, nhận props. |
| **Tiện ích** | `lib/` | `api.ts` (fetch), `sse.ts` (EventSource), `strokes.ts` (bắt nét vẽ), `useCountdown.ts`. |

**Giao diện dùng Tailwind CSS 4.** Theme được khai báo ngay trong `apps/web/src/styles.css`
bằng khối `@theme` — **không có `tailwind.config.js`** (đây là cách của Tailwind v4).
Muốn thêm màu hay token mới thì thêm biến `--color-*` vào khối đó, rồi dùng như utility bình
thường (`bg-brand`, `text-muted`, …). Hạn chế viết CSS rời; chỉ viết tay khi thật cần
(ví dụ `touch-action: none` cho canvas vẽ).

### Điểm cắm — cách 2 track nối vào nền tảng mà KHÔNG sửa file 🔒

Nền tảng cung cấp sẵn 3 điểm cắm. Mỗi track chỉ **gọi**, không cần sửa file dùng chung:

| Điểm cắm | Ở đâu | Dùng thế nào |
|---|---|---|
| `registerStartHook(game, fn)` | `store/lobby.ts` | Chạy khi BTC bấm BẮT ĐẦU. A sinh câu hỏi, B chọn từ khoá. |
| `registerHealth(name, fn)` | `lib/health.ts` | Báo tình trạng ở `/api/health`. B báo `model: ready`. |
| `Play.tsx` (dispatcher) | `apps/web/src/routes/` | Đọc `round.game` → render `MathGame` hoặc `DrawGame`. |

Track A thêm vào `routes/math.ts`:

```ts
registerStartHook('math', (round, now) => {
  round.questions = generateQuestions(seed, 60);
});
```

Track B thêm vào `routes/draw.ts`:

```ts
registerStartHook('draw', (round) => {
  round.target = pickTarget();
});
registerHealth('model', () => (isModelReady() ? 'ready' : 'not-loaded'));
```

Cả hai đều **không đụng** `app.ts`, `lobby.ts`, hay `App.tsx` — đó là mục đích của các điểm cắm này.

### Luồng request

**Tính nhanh** — mọi con số quyết định đều ở server:

```
Client                          Server
  │                                │
  ├── POST /api/rounds/join ──────►│  gán playerId, thêm vào Round
  │◄── { playerId, endsAt } ───────│  (chưa bắt đầu — chờ BTC)
  │                                │
  │        … BTC bấm BẮT ĐẦU …     │  startedAt=now, endsAt=now+90s
  │                                │  sinh sẵn 60 câu hỏi
  │                                │
  ├── POST /:id/answer ───────────►│  ① còn trong giờ?  ② ≥250ms từ câu trước?
  │   { playerId, idx, value }     │  ③ đúng câu hiện tại?  → tự chấm điểm
  │◄── { correct, question kế } ───│  (KHÔNG có field score trong request)
  │                                │
  ├── GET  /:id/stream (SSE) ─────►│  đẩy trạng thái mỗi khi round.version đổi
  │◄── dashboard 5 người ──────────│  khi now > endsAt
```

**Vẽ hình** — ảnh không bao giờ đi qua mạng:

```
Client                                     Server
  │                                          │
  ├── POST /:id/frame ──────────────────────►│  ① còn trong 15s?  ② ≥1000ms từ frame trước?
  │   { strokes: [[[x,y],…],…] }             │  ③ rasterize(strokes) → 28×28
  │                                          │  ④ classify() → top-3 nhãn
  │                                          │  ⑤ accepted(top3, target)?
  │◄── { matched, top: […], timeLeftMs } ────│
  │                                          │  matched → chốt điểm = f(thời gian còn lại)
```

Client gửi **toạ độ nét thô**, không gửi ảnh. Server tự vẽ lại ở 28×28 — nhờ vậy client không thể
gửi một bức ảnh có sẵn, và payload nhẹ hơn base64 PNG khoảng 10–30 lần.

### Trạng thái hiện tại

| Thành phần | Trạng thái |
|---|---|
| Môi trường, build, 2 workspace | ✅ chạy được |
| Model AI tải + chạy offline | ✅ đã verify (`npm run check:offline`) |
| **Phase F — nền tảng** (store, lobby, SSE, admin, router, 2 stub) | ✅ **XONG** — 24 unit test + 18 smoke test |
| 🅰️ Track A — Tính nhanh (`math-gen`, `math-session`, `MathGame`) | ⬜ Wave 2 |
| 🅱️ Track B — Vẽ hình (`raster`, `classifier`, `draw-session`, `DrawGame`) | ⬜ Wave 2 |
| Tích hợp + load test + diễn tập | ⬜ Wave 3 |

Chạy kiểm tra nền tảng bất cứ lúc nào:

```bash
npm test     # 24 unit test cho store / lobby / dashboard
npm run smoke  # 18 kiểm tra end-to-end (tự bật server rồi tắt)
```

### Quy ước khi thêm code

1. **Thêm endpoint mới?** Tạo/sửa file trong `routes/` theo domain, validate body bằng zod, rồi gọi `services/`. Không viết luật chơi trong route.
2. **Thêm dữ liệu mới cho một lượt?** Thêm field vào `Round` hoặc `Player` trong `store/types.ts`. **Không** thêm database, ORM, hay migration.
3. **Đụng vào model AI?** Mọi thay đổi `dtype`, kích thước input, hay cách rasterize đều phải **chạy lại `eval-model.mjs` và đo accuracy** trước khi merge. Xem mục Ghi chú kỹ thuật.
4. **Test** đặt cạnh code (`*.test.ts`). Test chống gian lận là bắt buộc — nó bảo vệ tính công bằng của sự kiện.
5. **Hằng số có số đo** phải kèm comment nói rõ đã đo và đo ra sao.

---

## Yêu cầu

- Node.js >= 20 (đã test trên v24)
- ~150MB dung lượng cho `onnxruntime-node`

## Cài đặt

```bash
npm install
cp .env.example .env          # rồi sửa ADMIN_TOKEN
npm run prefetch              # tải model ONNX (~20MB) về ./models
npm run check:offline         # xác nhận chạy được khi không có internet
```

## Chạy dev

```bash
npm run dev:server            # Fastify  -> http://localhost:8787
npm run dev:web               # Vite     -> http://localhost:5173
```

Kiểm tra server: <http://localhost:8787/api/health>

## Build & chạy production

```bash
npm run build                 # web -> apps/web/dist, server -> apps/server/dist
npm start
```

## Ngày sự kiện

```bash
MODEL_OFFLINE=1 ADMIN_TOKEN=<mã-bí-mật> npm start
```

- Server phục vụ luôn static build của web → chỉ cần **1 URL duy nhất** (`http://<IP>:8787`).
- In QR trỏ tới URL đó dán ở khu vực chơi.
- **Bắt buộc chạy `npm run prefetch` trước** (khi còn internet) để tải model về `./models`.
- Xác nhận chạy được offline: `npm run check:offline` → phải in `✅ OFFLINE OK`.
  Script này chặn hẳn request tải model, nên nếu nó chạy được thì sự kiện không phụ thuộc internet.

---

## Ghi chú kỹ thuật

### Model nhận diện hình vẽ — luôn dùng `dtype: 'fp32'`

Đo thật trên 200 mẫu QuickDraw (20 class):

| dtype | top-1 |
|---|---|
| **fp32** | **82.5%** ✅ |
| fp16 | load lỗi ❌ |
| q8 | 7.0% ❌ |

Cùng một bộ weights. `q8` **âm thầm** phá accuracy 82.5% → 7.0% mà không báo lỗi gì — nó vẫn load
bình thường, vẫn chạy 4ms, chỉ là trả về kết quả sai một cách rất tự tin. Đừng "tối ưu RAM" bằng q8
ở đây. Xem `apps/server/src/model.ts`.

### Độ dày nét khi rasterize

Nét vẽ được thu nhỏ về 28×28 trước khi đưa vào model. Độ dày nét ở kích thước đó **quyết định
accuracy**: 1.5px → 70%, còn 2.5px → 19%. Hằng số đã hiệu chỉnh nằm trong `apps/server/src/raster.ts`.

### Vì sao không có `packages/shared`?

Rasterizer 28×28 và bảng nhãn **chỉ server dùng** — client gửi toạ độ nét thô, server tự rasterize.
Không có code nào dùng chung, nên gộp vào `apps/server/src/` sẽ tránh được friction của TS project
references mà không mất gì.

---

## Tài liệu thiết kế

Hai tài liệu, chia vai rõ ràng:

| Tài liệu | Vai trò |
|---|---|
| **`2026-09-11_231500-...-v2-inmemory.md`** | **Đặc tả kỹ thuật.** Kiến trúc, chống gian lận, hằng số đã đo, checklist sự kiện, bảng rủi ro. Đọc trước. |
| **`2026-09-12_201457-clubday-split-2-tracks.md`** | **Điều phối công việc.** Chia 2 track song song, bảng phân quyền file, hợp đồng đóng băng, quy trình git. |

> Làm việc nhóm? Đọc file **split-2-tracks** để biết file nào của ai. Bảng phân quyền file ở mục 3
> là thứ quyết định việc 2 người có xung đột hay không.
