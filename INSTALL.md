# Hướng dẫn cài đặt ClubDay

Từ máy trắng đến chạy được, mất khoảng **10 phút** (phần lớn là chờ tải).
Làm đúng theo thứ tự — mỗi bước đều có cách kiểm tra "đã đúng chưa" trước khi đi tiếp.

> Các lệnh dưới viết theo **bash** (Git Bash trên Windows). PowerShell cũng chạy được,
> trừ cách đặt biến môi trường trước lệnh — xem [Phụ lục PowerShell](#phụ-lục-powershell).

---

## 0. Chuẩn bị máy

| Thứ cần | Ghi chú |
|---|---|
| **Node.js >= 20** | Đã chạy thật trên v22.22.2 và v24.13.0. Tải bản LTS ở <https://nodejs.org> |
| **Git** | Để clone repo |
| **~400MB trống** | `node_modules` ~350MB (`onnxruntime-node` chiếm phần lớn) + model ~20MB |
| **Internet** | Chỉ cần lúc cài. Ngày sự kiện chạy offline hoàn toàn |

Kiểm tra:

```bash
node -v     # phải >= v20
npm -v
```

Nếu `node -v` báo không tìm thấy lệnh → cài Node.js rồi **mở lại terminal**.

---

## 1. Lấy source và cài thư viện

```bash
git clone <repo-url> ClubDay
cd ClubDay
npm install
```

Đây là monorepo dùng npm workspaces — **chỉ chạy `npm install` ở thư mục gốc**, một lần là cài
cho cả `apps/server` lẫn `apps/web`. Không `cd` vào từng app để cài riêng.

> ⚠️ **Đọc log của `npm install`.** Trên Windows, phần mềm diệt virus hoặc thư mục đồng bộ
> (OneDrive) đôi khi chặn npm ghi file, và npm **chỉ cảnh báo chứ không báo lỗi**:
>
> ```
> npm warn tar TAR_ENTRY_ERROR UNKNOWN: unknown error, write
> ```
>
> Thấy dòng này nghĩa là có file bị thiếu — build hoặc test sẽ gãy sau đó với lỗi kiểu
> `Could not resolve './icons/...'`. Cách sửa ở [mục Xử lý sự cố](#xử-lý-sự-cố).

Kiểm tra:

```bash
ls node_modules/.bin/vite    # phải thấy file
```

---

## 2. Tạo file cấu hình `.env`

```bash
cp .env.example .env         # Windows CMD dùng:  copy .env.example .env
```

Mở `.env` và **đổi `ADMIN_TOKEN`** — đây là mật khẩu bảo vệ trang `/admin`, nơi BTC tạo lượt
chơi và bấm BẮT ĐẦU. Để nguyên giá trị mẫu thì ai cũng vào được.

```ini
PORT=8787
HOST=0.0.0.0
ADMIN_TOKEN=dat-ma-rieng-cua-ban-o-day
MODEL_CACHE_DIR=./models
MODEL_OFFLINE=0
```

| Biến | Việc |
|---|---|
| `PORT` | Cổng server. Đổi nếu 8787 đã bị chiếm |
| `HOST` | `0.0.0.0` thì điện thoại cùng Wi-Fi vào được. `127.0.0.1` là chỉ máy này |
| `ADMIN_TOKEN` | Mã vào `/admin`. **Bắt buộc đổi** |
| `MODEL_CACHE_DIR` | Nơi cất model AI |
| `MODEL_OFFLINE` | `1` = cấm mọi request tải model từ internet. `0` khi đang cài, `1` ngày sự kiện |

Muốn sinh mã ngẫu nhiên:

```bash
node -e "console.log(require('crypto').randomBytes(9).toString('base64url'))"
```

`.env` đã nằm trong `.gitignore` — không bị commit lên repo.

> Biến môi trường **thắng** `.env`. Ví dụ `ADMIN_TOKEN=abc npm start` sẽ dùng `abc` và bỏ qua
> giá trị trong file — tiện khi thử nhanh mà không muốn sửa file.

---

## 3. Tải model AI về máy

Game *Vẽ hình nhanh* chấm điểm bằng model ONNX chạy ngay trên máy BTC, không gọi API ngoài.
Phải tải về **khi còn internet**:

```bash
npm run prefetch
```

Mất khoảng 20–60 giây, tải ~20MB về `./models`. Log kết thúc bằng `Xong trong ...s.`

Sau đó **xác nhận model chạy được khi mất mạng** — lệnh này chặn hẳn request ra internet
rồi thử load + chấm một hình:

```bash
npm run check:offline
```

Phải in:

```
✅ OFFLINE OK — load + inference ...ms, top1="line"
   Sự kiện sẽ không phụ thuộc internet.
```

**Chưa thấy dòng này thì đừng mang máy đi sự kiện.** Đây là bước duy nhất phụ thuộc internet,
và cũng là thứ hay bị quên nhất.

---

## 4. Build và kiểm tra

```bash
npm run build
```

Build ra `apps/web/dist` (giao diện) và `apps/server/dist` (server). Không có dòng `error` nào là đạt.

Chạy test để chắc máy này cài đúng:

```bash
npm test        # 171 unit test — server 143 + web 28
npm run smoke   # 68 kiểm tra end-to-end, tự bật server ở cổng 8799 rồi tắt
```

`npm run smoke` mất ~30 giây vì có đoạn chờ hết giờ 15 giây của một lượt vẽ — đứng im một lúc
là bình thường, không phải treo.

Cả hai phải kết thúc `0 failed`.

---

## 5. Chạy thử

### Cách dùng ngày sự kiện — một cổng duy nhất

```bash
npm start
```

Mở <http://localhost:8787>. Server phục vụ cả API lẫn giao diện, không cần Vite.
Kiểm tra server sống: <http://localhost:8787/api/health> — phải trả `{"ok":true,...,"model":"ready"}`.

Tắt bằng `Ctrl+C` — server tự lưu snapshot trước khi thoát.

### Cách dùng khi sửa code — hai terminal

```bash
# Terminal 1
npm run dev:server     # http://localhost:8787

# Terminal 2
npm run dev:web        # http://localhost:5173
```

Mở **<http://localhost:5173>**, *không phải* 8787. Vite phục vụ giao diện và tự chuyển tiếp
`/api` sang server. Thiếu một trong hai terminal là trang trắng.

---

## 6. Cho điện thoại vào chơi (LAN)

Lấy IP máy BTC:

```bash
ipconfig               # tìm dòng "IPv4 Address", ví dụ 192.168.1.14
```

Điện thoại **cùng Wi-Fi** với máy BTC, mở `http://192.168.1.14:8787`.

Không vào được thì kiểm tra theo thứ tự:

1. `.env` có `HOST=0.0.0.0` chưa (không phải `127.0.0.1`).
2. Windows Firewall — lần đầu chạy sẽ hiện hộp thoại, bấm **Allow**. Lỡ bấm Cancel thì mở tay:
   ```bash
   netsh advfirewall firewall add rule name="ClubDay" dir=in action=allow protocol=TCP localport=8787
   ```
3. Wi-Fi khách (guest network) thường chặn các máy trong mạng nói chuyện với nhau — dùng Wi-Fi thường.

---

## 7. Checklist trước ngày sự kiện

- [ ] `npm run prefetch` đã chạy **khi còn internet**
- [ ] `npm run check:offline` in `✅ OFFLINE OK`
- [ ] `ADMIN_TOKEN` trong `.env` đã đổi khỏi giá trị mẫu
- [ ] `npm run build` không lỗi
- [ ] `npm test` và `npm run smoke` đều `0 failed`
- [ ] Đã vào được `/admin` bằng token và tạo thử một lượt
- [ ] Đã thử từ **điện thoại thật** qua LAN, không chỉ localhost
- [ ] Đã diễn tập đủ 5 người, cả 2 game
- [ ] In QR trỏ `http://<IP>:8787` dán ở khu vực chơi
- [ ] Tắt sleep/hibernate và Windows Update trên máy BTC; cắm sạc

Lệnh chạy ngày sự kiện:

```bash
npm run build
MODEL_OFFLINE=1 npm start
```

---

## Xử lý sự cố

### Build lỗi `Could not resolve './icons/...'`, hoặc test lỗi `SyntaxError: Invalid or unexpected token` trong `node_modules`

`npm install` đã ghi thiếu file (xem cảnh báo `TAR_ENTRY_ERROR` ở [bước 1](#1-lấy-source-và-cài-thư-viện)).
Cài lại sạch:

```bash
rm -rf node_modules apps/web/node_modules apps/server/node_modules
npm ci
```

Lần này log **không được** có dòng `TAR_ENTRY_ERROR` nào. Vẫn còn thì tạm tắt real-time protection
của phần mềm diệt virus, hoặc chuyển project ra khỏi thư mục OneDrive/thư mục đồng bộ, rồi cài lại.

`npm ci` cài đúng theo `package-lock.json` và luôn xoá `node_modules` trước — dùng nó thay
`npm install` mỗi khi nghi ngờ thư viện hỏng.

### Các lỗi thường gặp khác

| Hiện tượng | Cách sửa |
|---|---|
| `EADDRINUSE :8787` | Cổng bị chiếm. Đổi `PORT` trong `.env`, hoặc `netstat -ano \| grep :8787` rồi `taskkill /F /PID <pid>` |
| Mở 5173 ra trang trắng | Chưa chạy `npm run dev:server` ở terminal kia |
| Model lỗi lúc khởi động | Chưa chạy `npm run prefetch` |
| `check:offline` thất bại | Xoá `./models` rồi `npm run prefetch` lại khi có internet |
| `/admin` báo "Sai mã quản trị" | Mã nhập khác `ADMIN_TOKEN` trong `.env` |
| Vào `/admin` không cần mã | `.env` thiếu `ADMIN_TOKEN`. Server có in cảnh báo lúc khởi động |
| Sửa `.env` mà không thấy đổi | Server chỉ đọc `.env` lúc khởi động — phải khởi động lại |
| "Lượt này đủ 5 người rồi" | Đúng thiết kế, mỗi lượt tối đa 5 người. BTC tạo lượt mới ở `/admin` |

---

## Phụ lục: PowerShell

PowerShell không hiểu cú pháp `BIEN=giatri lenh`. Thay bằng:

```powershell
copy .env.example .env          # thay cho cp
$env:MODEL_OFFLINE = "1"; npm start
```

Biến đặt bằng `$env:` chỉ sống trong cửa sổ PowerShell đó.

---

## Tất cả lệnh

| Lệnh | Việc |
|---|---|
| `npm install` / `npm ci` | Cài thư viện (chạy ở thư mục gốc) |
| `npm run prefetch` | Tải model ONNX về `./models` — cần internet |
| `npm run check:offline` | Xác nhận model load được khi không có internet |
| `npm run build` | Build cả web và server |
| `npm start` | Chạy bản đã build — một cổng phục vụ cả API lẫn web |
| `npm run dev:server` | Server dev, tự nạp lại khi sửa code |
| `npm run dev:web` | Giao diện dev (Vite), cổng 5173 |
| `npm test` | 171 unit test, cả 2 workspace |
| `npm run smoke` | 68 kiểm tra end-to-end |
| `npm run eval:model` | Đo accuracy thật rồi sinh lại `allowlist.generated.ts` (~35s) |

Kiến trúc, cách tính điểm và quy ước code nằm ở [README.md](README.md).
