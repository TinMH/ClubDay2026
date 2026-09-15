# ClubDay

Web 2 trò chơi cho sự kiện CLB. Mỗi **lượt tối đa 5 người**, chơi xong hiện dashboard của đúng nhóm đó.

| Game | Thời lượng | Cách chơi |
|---|---|---|
| **Tính nhanh** | 90 giây | Chọn 1 trong 4 đáp án. **Điểm = chuỗi đúng dài nhất** |
| **Vẽ hình nhanh** | 15 giây | Vẽ theo từ khoá rồi **bấm NỘP BÀI** để AI chấm — hết giờ thì tự nộp |

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
│   │   │   │   ├── math.ts        ✅ 🅰️ API Tính nhanh (đã xong)
│   │   │   │   └── draw.ts        ✅ 🅱️ API Vẽ (đã xong)
│   │   │   │
│   │   │   ├── services/          ── NGHIỆP VỤ: không biết gì về HTTP
│   │   │   │   ├── math-gen.ts    ✅ 🅰️ sinh câu hỏi (PRNG seed, chống trùng liền kề)
│   │   │   │   ├── math-session.ts✅ 🅰️ trọng tài Tính nhanh (đồng hồ, spam, chấm điểm)
│   │   │   │   ├── raster.ts      ✅ 🅱️ nét → 28×28 (hằng số ĐÃ ĐO — đừng đổi)
│   │   │   │   ├── classifier.ts  ✅ 🅱️ model singleton, ghim fp32, hàng đợi tuần tự
│   │   │   │   ├── labels.ts      ✅ 🅱️ từ khoá + tên tiếng Việt + luật chấp nhận
│   │   │   │   ├── allowlist.generated.ts ✅ 🅱️ SINH TỰ ĐỘNG — đừng sửa tay
│   │   │   │   └── draw-session.ts✅ 🅱️ trọng tài Vẽ (đồng hồ, spam, seq, chấm điểm)
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
│       │   │   ├── MathGame.tsx   ✅ 🅰️ màn hình Tính nhanh (đã xong)
│       │   │   └── DrawGame.tsx   ✅ 🅱️ màn hình Vẽ (frame = gợi ý, nút NỘP BÀI)
│       │   ├── components/
│       │   │   ├── Shell.tsx      ✅ 🔒 khung màn hình
│       │   │   ├── Countdown.tsx  ✅ 🔒 đồng hồ + thanh tiến độ
│       │   │   ├── RankTable.tsx  ✅ 🔒 bảng hạng
│       │   │   ├── ChoicePad.tsx  ✅ 🅰️ 4 nút đáp án (server sinh + xáo trộn)
│       │   │   ├── DrawCanvas.tsx ✅ 🅱️ canvas + giữ pointer (setPointerCapture)
│       │   │   ├── Avatar.tsx     ✅    ô chữ cái đầu tên người chơi
│       │   │   └── Chips.tsx      ✅    nhãn game, kết nối, trạng thái lượt, spinner
│       │   └── lib/               ✅ api · sse · useCountdown · session · types · format (🔒)
│       │                          ✅    game-theme.ts — icon + màu nhận diện từng game
│       │                          ✅ 🅰️ api-math.ts — client riêng của Track A
│       │                          ✅ 🅱️ api-draw.ts — client riêng của Track B
│       │                          ✅ 🅱️ strokes.ts — gom nét từ pointer event
│       ├── index.html             ✅
│       ├── vite.config.ts         ✅ (proxy /api → :8787 khi dev)
│       ├── package.json           ✅
│       └── tsconfig.json          ✅
│
├── scripts/                       ── Công cụ vận hành — KHÔNG thuộc runtime
│   ├── prefetch-model.ts          ✅ tải model về ./models để chạy offline
│   ├── check-offline.ts           ✅ chặn internet, xác nhận model vẫn load được
│   ├── smoke-test.mjs             ✅ chạy thử end-to-end (68 kiểm tra)
│   ├── eval-model.ts              ✅ 🅱️ đo accuracy 345 class → SINH RA allowlist
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
thường (`bg-primary`, `text-muted`, …). Hạn chế viết CSS rời; chỉ viết tay khi thật cần
(ví dụ `touch-action: none` cho canvas vẽ).

Phong cách "Vibrant & Block-based" (nền tím than, khối màu đậm, nút có đế khối). Vài class
dùng chung khai báo trong `@layer components` của `styles.css`: `.btn` (+ `btn-primary`,
`btn-accent`, `btn-correct`, `btn-ghost`, `btn-sm`, `btn-lg`), `.card`, `.field`. Mỗi game có
màu nhận diện riêng (`math` xanh cyan, `draw` hồng) — xem `lib/game-theme.ts`.

Font **Baloo 2** (tiêu đề, con số) + **Be Vietnam Pro** (nội dung) được **tự host** qua
`@fontsource` — không dùng Google Fonts CDN vì ngày sự kiện có thể không có internet.
Icon dùng `lucide-react` (SVG, đóng gói vào bundle), không dùng emoji làm icon.

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

**Vẽ hình** — ảnh không bao giờ đi qua mạng, và ĐIỂM CHỈ SINH RA KHI NỘP:

```
Client                                     Server
  │                                          │
  ├── POST /:id/frame (mỗi ~1s) ────────────►│  ① còn trong 15s?  ② ≥1000ms từ frame trước?
  │   { strokes: [[[x,y],…],…] }             │  ③ rasterize(strokes) → 28×28
  │                                          │  ④ classify() → top-3 nhãn
  │◄── { hint, top: […] } ───────────────────│  ⬅ GỢI Ý thôi: KHÔNG cộng điểm
  │                                          │     (server giữ lại nét mới nhất)
  │                                          │
  │        … người chơi bấm NỘP BÀI …        │
  ├── POST /:id/submit ─────────────────────►│  ① chưa nộp?  ② còn trong quãng ân hạn?
  │   { strokes } — bỏ trống = nét server giữ │  ③ rasterize → classify → so từ khoá
  │◄── { matched, score, reason } ───────────│  ④ score = 150 − số giây (kẹp ở 15)
  │                                          │
  │        … hết 15 giây …                   │  hook kết thúc lượt: ai CHƯA nộp thì
  │                                          │  server tự chấm bằng nét cuối nó giữ
```

Client gửi **toạ độ nét thô**, không gửi ảnh. Server tự vẽ lại ở 28×28 — nhờ vậy client không thể
gửi một bức ảnh có sẵn, và payload nhẹ hơn base64 PNG khoảng 10–30 lần.

Điểm **không** phụ thuộc vào việc AI có đọc ra hình trong lúc đang vẽ hay không: frame chỉ để hiện
"AI nghĩ: …". Nếu hễ model đọc ra là cộng điểm thì người đang vẽ dở cũng bị tính là đã thắng — đó
là lỗi cũ, và có test canh để nó không quay lại.

### Trạng thái hiện tại

| Thành phần | Trạng thái |
|---|---|
| Môi trường, build, 2 workspace | ✅ chạy được |
| Model AI tải + chạy offline | ✅ đã verify (`npm run check:offline`) |
| **Phase F — nền tảng** (store, lobby, SSE, admin, router, 2 stub) | ✅ **XONG** |
| 🅰️ Track A — Tính nhanh (`math-gen`, `math-session`, `math-options`, `ChoicePad`) | ✅ **XONG** — đã merge `main` |
| 🅱️ Track B — Vẽ hình (`raster`, `classifier`, `labels`, `draw-session`) | ✅ **XONG** — đã merge `main` |
| 🅱️ **Nộp bài** — nút NỘP BÀI + tự nộp khi hết giờ | ✅ **XONG** trên nhánh `feat/draw-submit` |
| Tích hợp + load test + diễn tập | ⬜ Wave 3 |

Chạy kiểm tra bất cứ lúc nào:

```bash
npm test       # 169 unit test — nền tảng + Track A + Track B (143 server + 26 web)
npm run smoke  # 68 kiểm tra end-to-end (tự bật server rồi tắt, có nạp model thật)
               # ⏱ chậm hơn trước ~20s: có kiểm tra phải chờ hết 15 giây thật của lượt Vẽ
```

Test của game Tính nhanh tập trung vào **chống gian lận**: hết giờ không cộng điểm dù đúng,
chặn trả lời nhanh hơn 250ms, không cho nhảy câu hay trả lời lại, và **đáp án không bao giờ
được gửi ra client** (có regression test riêng cho việc này).

### Cách tính điểm Tính nhanh — đọc trước khi sửa

Điểm là **chuỗi đúng dài nhất**, không phải tổng số câu đúng. Trả lời sai làm chuỗi hiện tại
về 0 nhưng **không** lấy đi chuỗi dài nhất đã lập — người vừa mất chuỗi vẫn còn lý do trả lời
tiếp thay vì buông xuôi 90 giây.

Hệ quả cần nhớ: `player.score` **mỗi game một nghĩa** — Tính nhanh là chuỗi dài nhất, Vẽ hình
là `150 − số giây`. `dashboard.ts` là nơi **duy nhất** đọc nó để xếp hạng. Bằng điểm là chuyện
thường gặp ở Tính nhanh, nên khi bằng thì xếp theo **số câu đúng nhiều hơn**; nếu rơi thẳng
xuống so thời gian thì người trả lời ít câu hơn lại xếp trên, ngược hẳn với điều ai cũng nghĩ
là công bằng. Luật tie-break này **chỉ áp cho `game === 'math'`** — có test canh để nó không
rò sang game Vẽ.

### Cách chấm điểm Vẽ hình — đọc trước khi sửa

Điểm chỉ sinh ra ở **đúng một thời điểm**: lúc bài được NỘP, và mỗi người chỉ nộp được một lần.

- Bấm **NỘP BÀI** → chấm ngay: `150 − số giây đã dùng`; không nhận ra hình thì 0 điểm.
- Hết 15 giây → client tự nộp. Ai không gửi được (treo tab, mất mạng) thì **server tự nộp hộ**
  bằng nét vẽ cuối cùng nó đã nhận được, không cần client hợp tác.
- Nộp lại lần nữa **không** chấm lại — server trả về đúng kết quả cũ kèm `already: true`, nên bấm
  đúp hay mạng bắn lại cũng không đổi điểm.

Hai chỗ dễ sửa nhầm:

1. **Quãng ân hạn 2.5 giây** (`SUBMIT_GRACE_MS`) sau mốc hết giờ. Bài nộp thật của client luôn tới
   sau `endsAt` vài trăm ms, mà đồng hồ nền của server quét mỗi 500ms — không có quãng này thì mọi
   bài nộp đúng lúc hết giờ đều bị trả `TIME_UP` và cả lượt không ai có điểm. Số giây bị **kẹp ở độ
   dài lượt**, nên nộp muộn không thể ăn điểm cao hơn nộp đúng mốc. Đường TỰ NỘP của server chạy
   *sau* quãng đó nên phải truyền `force: true`, không thì nó bị chính quãng ân hạn chặn lại.
2. **Bỏ qua lượt (admin) KHÔNG tự nộp.** Bỏ qua là huỷ lượt, thời gian gần như bằng 0, nên nếu để
   hook kết thúc lượt tự chấm thì cả 5 người bỗng được ~150 điểm và nhảy lên đầu bảng.

### Quy ước khi thêm code

1. **Thêm endpoint mới?** Tạo/sửa file trong `routes/` theo domain, validate body bằng zod, rồi gọi `services/`. Không viết luật chơi trong route.
2. **Thêm dữ liệu mới cho một lượt?** Thêm field vào `Round` hoặc `Player` trong `store/types.ts`. **Không** thêm database, ORM, hay migration.
3. **Đụng vào model AI?** Mọi thay đổi `dtype`, kích thước input, hay cách rasterize đều phải **chạy lại `eval-model.mjs` và đo accuracy** trước khi merge. Xem mục Ghi chú kỹ thuật.
4. **Test** đặt cạnh code (`*.test.ts`). Test chống gian lận là bắt buộc — nó bảo vệ tính công bằng của sự kiện.
5. **Hằng số có số đo** phải kèm comment nói rõ đã đo và đo ra sao.

---

## Cách chạy

Bốn mốc: **cài một lần** → **dev hằng ngày** → **chạy bản thật** → **thử chơi**.

### 0. Yêu cầu

| | |
|---|---|
| Node.js | >= 20 (đã test trên v24.13.0) |
| Dung lượng trống | ~150MB cho `onnxruntime-node`, ~20MB cho model |
| Shell | bash (git-bash trên Windows). Các lệnh dưới viết theo bash. |

### 1. Cài đặt (chỉ một lần)

```bash
git clone <repo-url> ClubDay
cd ClubDay
npm install
```

Tạo file cấu hình:

```bash
cp .env.example .env          # Windows không có cp thì dùng:  copy .env.example .env
```

Mở `.env` và **đổi `ADMIN_TOKEN`** — đây là mật khẩu bảo vệ trang `/admin`:

```ini
ADMIN_TOKEN=ma-cua-ban-dat-o-day
PORT=8787
```

Tải model AI về máy (cần internet, chỉ một lần):

```bash
npm run prefetch              # tải model ONNX (~20MB) về ./models
npm run check:offline         # phải in "✅ OFFLINE OK"
```

> **Thứ tự ưu tiên:** biến môi trường **thắng** `.env`.
> Nên `MODEL_OFFLINE=1 npm start` ghi đè giá trị trong `.env` — tiện khi cần thử nhanh mà không sửa file.

### 2. Chạy khi phát triển

Cần **2 terminal chạy song song**:

```bash
# Terminal 1 — server API
npm run dev:server            # http://localhost:8787

# Terminal 2 — giao diện web
npm run dev:web               # http://localhost:5173
```

Mở **<http://localhost:5173>** — *không phải* 8787.
Ở chế độ dev, Vite phục vụ giao diện và tự chuyển tiếp `/api` sang server. Thiếu một trong hai terminal là không chạy được.

Kiểm tra server sống: <http://localhost:8787/api/health>

### 3. Chạy bản thật (giống ngày sự kiện)

```bash
npm run build                 # web -> apps/web/dist, server -> apps/server/dist
npm start
```

Lúc này **chỉ cần một URL duy nhất**: <http://localhost:8787> — server phục vụ luôn cả giao diện.
Chế độ này **không cần** chạy Vite nữa.

Tắt server: `Ctrl+C` — server tự lưu snapshot trước khi thoát.

### 4. Thử chơi — luồng vận hành

| Bước | Ai | Làm gì |
|---|---|---|
| 1 | BTC | Mở `/admin`, dán `ADMIN_TOKEN` vào ô trên cùng (lưu vào máy, chỉ nhập một lần) |
| 2 | BTC | Bấm **+ Lượt Tính nhanh** hoặc **+ Lượt Vẽ hình** → hiện mã 6 ký tự và URL để in QR |
| 3 | Người chơi | Quét QR (hoặc mở `http://<IP>:8787`) → nhập tên → vào phòng chờ |
| 4 | | Tối đa **5 người**. Người thứ 6 bị chặn và báo "chờ lượt sau" |
| 5 | BTC | Bấm **BẮT ĐẦU** — ở `/admin`, hoặc ở `/lobby/<mã>` nếu máy đó đã nhập token |
| 6 | | Hết giờ tự chuyển sang bảng xếp hạng của đúng 5 người đó |

Vài chi tiết đã cài sẵn:
- Nút **BẮT ĐẦU** chỉ hiện ở `/lobby` nếu trình duyệt đó đã nhập `ADMIN_TOKEN` ở `/admin` (lưu trong localStorage). Máy BTC nhập một lần là xong.
- Bắt đầu được với **≥ 1 người** — không có timeout tự động, BTC chủ động về nhịp.
- Bấm **Bỏ qua** ở `/admin` để kết thúc lượt ngay.
- Ai vào sau khi lượt đã bắt đầu sẽ bị từ chối — để không ai bị thiếu giờ so với người khác.

### 5. Chơi từ điện thoại (LAN)

Lấy IP máy BTC:

```bash
ipconfig                      # tìm dòng "IPv4 Address", ví dụ 192.168.1.14
```

Điện thoại **cùng Wi-Fi**, mở `http://192.168.1.14:8787`.

Nếu không vào được:
- Server phải bind `0.0.0.0` (mặc định), không phải `127.0.0.1`.
- Windows Firewall có thể chặn lần đầu — bấm **Allow** ở hộp thoại, hoặc mở cổng thủ công:
  ```bash
  netsh advfirewall firewall add rule name="ClubDay" dir=in action=allow protocol=TCP localport=8787
  ```
- Điện thoại và máy BTC phải **cùng một mạng** — Wi-Fi khách (guest) thường chặn kết nối nội bộ.

### 6. Checklist ngày sự kiện

```bash
npm run build
MODEL_OFFLINE=1 ADMIN_TOKEN=<mã-bí-mật> npm start
```

- **Bắt buộc `npm run prefetch` trước** khi còn internet, và xác nhận bằng `npm run check:offline`
  → phải in `✅ OFFLINE OK`. Lệnh này chặn hẳn request tải model, nên chạy được nghĩa là
  sự kiện không phụ thuộc internet.
- In QR trỏ `http://<IP>:8787` dán ở khu vực chơi.
- Tắt sleep/hibernate và Windows Update trên máy BTC; cắm sạc.
- Diễn tập trước bằng 5 người thật, cả 2 game.

### Tất cả lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev:server` | Server dev, tự nạp lại khi sửa code |
| `npm run dev:web` | Giao diện dev (Vite) |
| `npm start` | Chạy bản đã build — server phục vụ cả API lẫn web, 1 cổng |
| `npm run build` | Build cả web và server |
| `npm test` | 121 unit test — cả 2 workspace (server 104 + web 17) |
| `npm run smoke` | 43 kiểm tra end-to-end — tự bật server ở cổng 8799 rồi tắt |
| `npm run prefetch` | Tải model ONNX về `./models` |
| `npm run check:offline` | Xác nhận model vẫn load được khi không có internet |
| `npm run eval:model` | Đo accuracy THẬT rồi sinh lại `allowlist.generated.ts` (~35s) |

### Xử lý sự cố

| Hiện tượng | Cách sửa |
|---|---|
| `EADDRINUSE :8787` | Cổng bị chiếm. Đổi `PORT` trong `.env`, hoặc tìm và tắt tiến trình: `netstat -ano \| grep :8787` rồi `taskkill /F /PID <pid>` |
| Mở 5173 ra trang trắng | Chưa chạy `npm run dev:server` ở terminal kia |
| `/admin` báo "Sai mã quản trị" | `ADMIN_TOKEN` trong `.env` khác với mã đã nhập |
| Vào `/admin` không cần mã | `.env` chưa có `ADMIN_TOKEN`. Server in cảnh báo lúc khởi động — đọc log |
| "Lượt này đủ 5 người rồi" | Đúng thiết kế. BTC tạo lượt mới ở `/admin` |
| Model lỗi khi khởi động | Chưa chạy `npm run prefetch` |
| Sửa `.env` mà không thấy đổi | Server chỉ đọc `.env` lúc khởi động — phải khởi động lại |

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
accuracy**: 1.5px → 70%, còn 2.5px → 19%. Hằng số đã hiệu chỉnh nằm trong
`apps/server/src/services/raster.ts` — ĐỔI LÀ PHẢI CHẠY LẠI `npm run eval:model`.

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
