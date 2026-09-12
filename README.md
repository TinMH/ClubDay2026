# ClubDay

Web 2 trò chơi cho sự kiện CLB. Mỗi **lượt tối đa 5 người**, chơi xong hiện dashboard của đúng nhóm đó.

| Game | Thời lượng | Cách chơi |
|---|---|---|
| **Tính nhanh** | 90 giây | Trả lời phép toán, đúng +1 điểm |
| **Vẽ hình nhanh** | 15 giây | Vẽ theo từ khoá, model AI nhận diện |

## Kiến trúc

**Một process Node.js duy nhất** — không database, không Docker, không Python.

- **Server:** Fastify 5 + Transformers.js. Model ONNX nằm nóng trong RAM, inference ~3ms.
- **Client:** React 19 + Vite.
- **Lưu trữ:** `Map` trong RAM (`apps/server/src/store/`) + snapshot JSON tuỳ chọn. *Cố ý không dùng database* — mỗi lượt là dữ liệu phù du, xem plan.
- **Cập nhật realtime:** SSE.

Toàn bộ state game do **server** giữ: đồng hồ, điểm số, thứ tự câu hỏi. Client chỉ là màn hình + bàn phím.

## Yêu cầu

- Node.js >= 20 (đã test trên v24)
- ~150MB dung lượng cho `onnxruntime-node`

## Cài đặt

```bash
npm install
cp .env.example .env          # rồi sửa ADMIN_TOKEN
npm run prefetch              # tải model ONNX (~20MB) về ./models
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

## Ghi chú kỹ thuật

### Model nhận diện hình vẽ — luôn dùng `dtype: 'fp32'`

Đo thật trên 200 mẫu QuickDraw (20 class):

| dtype | top-1 |
|---|---|
| fp32 | **82.5%** ✅ |
| fp16 | load lỗi ❌ |
| q8 | 7.0% ❌ |

Cùng một bộ weights. `q8` **âm thầm** phá accuracy 82.5% → 7.0% mà không báo lỗi gì — nó vẫn load
bình thường, vẫn chạy 4ms, chỉ là trả về kết quả sai. Đừng "tối ưu RAM" bằng q8 ở đây.

Xem `apps/server/src/model.ts`.

### Độ dày nét khi rasterize

Nét vẽ được thu nhỏ về 28×28 trước khi đưa vào model. Độ dày nét ở kích thước đó **quyết định
accuracy**: 1.5px → 70%, còn 2.5px → 19%. Hằng số đã hiệu chỉnh nằm trong `apps/server/src/raster.ts`.

## Cấu trúc

```
apps/
  server/    Fastify API + model AI + state các lượt chơi
  web/       React + Vite
scripts/     prefetch model, eval model, load test
```

## Tài liệu thiết kế

Kế hoạch triển khai đầy đủ (kiến trúc, chống gian lận, task list, checklist sự kiện):
`.hermes/plans/2026-09-11_231500-clubday-2-games-nodejs-v2-inmemory.md`
