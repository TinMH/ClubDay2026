# ClubDay — Plan nối game vào việc tuyển thành viên

> **Đọc trước:** `.hermes/plans/2026-09-11_231500-clubday-2-games-nodejs-v2-inmemory.md` (đặc tả kiến trúc,
> chống gian lận, hằng số đã đo). File này **không lặp lại** đặc tả đó — nó chỉ nói việc còn phải làm và tại sao.
>
> **Trạng thái nền tảng:** Phase F + Track A + Track B đã xong và đã merge `main`. Setup đã verify trên máy thật
> (171 unit test, 68 smoke, model chạy offline). Xem [INSTALL.md](../../INSTALL.md).

**Goal:** Biến game từ "trò chơi vui" thành **công cụ thu form đăng ký thành viên** cho Club Day.

**Thước đo thành công:** số form đăng ký hợp lệ thu được trong ngày — **không phải** số lượt chơi.

---

## 0. Vì sao cần plan này

Sự kiện Club Day là nơi các CLB trổ tài để **mở form đăng ký thành viên**. Nhưng hệ thống hiện tại
thu đúng một thứ từ người chơi: `name`, tối đa 20 ký tự (`routes/rounds.ts:10`) — rồi vứt đi khi lượt kết thúc.

```
   HIỆN TẠI                              THIẾU
   quét QR → nhập tên → chơi → xem        ┌─────────────────────┐
   bảng xếp hạng → ...hết                 │ → để lại liên hệ    │
                                          │ → BTC có danh sách  │
                                          └─────────────────────┘
```

Cỗ máy thu hút người đứng lại đã chạy tốt. Cái xô hứng ở cuối thì chưa có.

Ba sự thật trong code khiến việc này gấp:

| Sự thật | Ở đâu | Hệ quả |
|---|---|---|
| Join chỉ nhận `name` | `routes/rounds.ts:10` | Không có bất kỳ đường nào để liên lạc lại với người chơi |
| `POST /api/admin/reset` xoá sạch | `routes/admin.ts:45` | BTC lỡ tay bấm là mất hết |
| Snapshot tự nhận "KHÔNG phải database" | `store/snapshot.ts:1-6` | Dữ liệu chỉ để xem lại, không thiết kế để giữ lâu |

---

## 1. Hai quyết định kiến trúc đã chốt

### 1.1 — Dùng Google Form, KHÔNG tự xây kho đăng ký

**✅ CHỐT: màn kết quả gắn link Google Form. Server không lưu dữ liệu cá nhân nào.** (quyết định 2026-09-17)

Bản đầu của plan này định tự xây: `store/signups.ts`, `POST /api/signups`, chống trùng MSSV, xuất CSV,
test cho từng phần. Đã bỏ. Google Form làm sẵn hết những việc đó.

| | Tự xây | Google Form |
|---|---|---|
| Công sức | ~3 ngày | ~10 phút |
| Dữ liệu nằm ở | Laptop BTC | Google Sheets |
| Laptop hỏng giữa sự kiện | **Mất hết** | Không sao |
| BTC xem kết quả | Phải mò file trong `data/` | Mở Sheets, nhiều người xem cùng lúc |
| Thêm câu hỏi giữa sự kiện | Sửa code + build lại | Sửa Form, có hiệu lực ngay |

Đổi lại có một **xung đột thật phải nhớ**: Google Form **cần internet**, mà game thì thiết kế để chạy
offline. Người chơi mở được Form hay không phụ thuộc điện thoại họ đang ở đâu:

| Điện thoại người chơi đang ở | Form mở được? |
|---|---|
| Wifi hội trường có internet | ✅ |
| Hotspot từ điện thoại BTC (chia 4G) | ✅ |
| LAN thuần không có đường ra internet | ❌ **hỏng** |

**Phòng bị không tốn dòng code nào:** in QR của Form ra giấy dán cạnh khu vực chơi. Ai mở không được
trong app thì quét bằng 4G của họ — cũng vớt được người đứng xem mà không chơi.

> **Hệ quả tốt:** server không giữ MSSV/email/SĐT của ai cả, nên mọi lo về xử lý dữ liệu cá nhân trên
> máy BTC biến mất. Không cần `SIGNUPS_FILE`, không cần giới hạn tốc độ chống spam, không cần xuất CSV.

### 1.2 — Chạy LAN trên máy BTC, KHÔNG deploy lên host

**✅ CHỐT: ngày sự kiện chạy `npm start` trên máy BTC, người chơi vào qua LAN.** (quyết định 2026-09-17)

Đã cân nhắc VPS và loại. Ghi lại phép tính để sau không phải bàn lại:

**Tải inference lúc cao điểm.** Client gửi frame mỗi 1050ms (`routes/DrawGame.tsx:39`), server chặn dưới
1000ms (`store/types.ts:112`). 5 người vẽ cùng lúc → **~5 lần chạy model mỗi giây**, mỗi lần **256ms** đo
trên máy BTC (i5-10400, 6 nhân).

> **1,28 giây CPU cho mỗi giây đồng hồ.** Trên 6 nhân là ~21%, thoải mái.
> Nhưng nó đã **vượt quá một nhân** — VPS 1 vCPU giá rẻ sẽ không kịp, hàng đợi dồn lại, gợi ý hiện ra
> sau khi lượt 15 giây đã xong.

Muốn chạy VPS thì tối thiểu **4 vCPU dedicated** (không phải burstable), ≥1GB RAM, vùng **Singapore/VN**,
và phải load test 5 người trên chính con VPS đó.

**Lý do chọn LAN dù VPS chạy được:** offline là thứ duy nhất không hỏng vì lý do ngoài tầm kiểm soát.
VPS bắt cả sự kiện phụ thuộc internet hội trường hoặc 4G — mạng sập là không có đường lui.
Cả kiến trúc `MODEL_OFFLINE=1` + `npm run check:offline` sinh ra để làm được điều này.

**Rủi ro đã biết của LAN:** wifi khách (guest network) chặn các máy trong mạng nói chuyện với nhau → LAN
chết hẳn, không cứu được bằng cấu hình. Phòng bị theo thứ tự:

1. **Hotspot từ điện thoại BTC** — máy BTC và người chơi cùng vào. Không cần internet, không sửa code.
2. **Cloudflare Tunnel** — vẫn chạy `npm start` trên máy BTC, chỉ thêm URL public. Không deploy, model vẫn
   nóng trong RAM. Chỉ dùng khi hết cách vì nó kéo internet vào lại.

**VPS vẫn đáng có cho việc khác:** nếu muốn form đăng ký + bảng xếp hạng sống tiếp sau sự kiện để CLB nhận
đăng ký những ngày sau. Đó là workload nhẹ, không chạy model — VPS 1 vCPU rẻ nhất là thừa.

---

## 2. Wave 4 — Phễu đăng ký ✅ ĐÃ XONG (2026-09-17)

Cài đặt theo quyết định 1.1 — gắn link Google Form, không tự xây kho.

### 4.1 — Cấu hình qua `.env` ✅

- [x] `config.ts` — `SIGNUP_FORM_URL` + `SIGNUP_NAME_ENTRY`, rỗng là mặc định an toàn (không hiện nút)
- [x] `routes/config.ts` — `GET /api/config`, chỉ trả thứ công khai
- [x] `app.ts` — đăng ký route (một dòng)
- [x] `.env.example` — ghi rõ cách lấy mã ô điền sẵn

**Vì sao qua server chứ không phải biến `VITE_` lúc build:** BTC đổi link thì sửa `.env` rồi khởi động
lại là xong. Nhét vào `VITE_` thì mỗi lần đổi phải `npm run build` — không hợp lúc đang chạy sự kiện.

### 4.2 — Nút đăng ký ở màn kết quả ✅

- [x] `lib/signup.ts` — `buildSignupUrl()` dựng link kèm tên điền sẵn
- [x] `routes/Dashboard.tsx` — nút **Đăng ký vào CLB** đặt TRÊN nút "Về trang chủ"
- [x] Điền sẵn tên đã nhập ở lobby → người chơi không phải gõ lại
- [x] `lib/signup.test.ts` — 8 test: link rỗng, link sai định dạng, chặn scheme lạ, tên có dấu, giữ query cũ
- [x] Smoke test: 3 kiểm tra `/api/config`, có một cái canh **không lộ `ADMIN_TOKEN`**

**Vì sao đặt ở màn kết quả:** thời điểm vàng — vừa chơi xong, đang vui, điện thoại đang cầm trên tay.
Đặt trước khi chơi thì thành rào chắn và mất người ngay ở cửa.

**Vì sao `buildSignupUrl` tách thành file riêng thay vì viết thẳng trong component:** để test được.
Link hỏng là người chơi rơi vào trang lỗi đúng bước quan trọng nhất của phễu. Hàm này cũng chặn
scheme không phải `http(s)` — `.env` là file người sửa tay, đừng để nó bơm thẳng được vào `href`.

### 4.3 — Còn lại, không phải việc code

- [ ] **Dán link Form thật vào `.env`** — hiện đang rỗng nên nút chưa hiện
- [ ] In QR của Form ra giấy làm phương án dự phòng
- [ ] Thử mở Form từ điện thoại **khi đang nối LAN của máy BTC** — đây là chỗ xung đột offline ở mục 1.1

---

## 3. Wave 5 — Làm phễu chạy mạnh hơn 🟡

Chỉ làm sau khi Wave 4 chạy được đầu-cuối.

### 5.1 — Màn hình chiếu công khai `/display`

- [ ] Route web mới, chữ to, tự cập nhật qua SSE (`routes/stream.ts` đã có sẵn)
- [ ] Hiện Top hôm nay + lượt đang chơi + QR để quét vào

**Vì sao đáng làm:** đây là thứ khiến người đi ngang dừng lại. Chi phí thấp vì hạ tầng SSE đã dựng xong.

### 5.2 — Bảng xếp hạng toàn sự kiện

- [ ] `store/leaderboard.ts` — tổng hợp qua tất cả các lượt
- [ ] Xếp **riêng từng game**, không gộp

> **⚠️ Cạm bẫy:** `player.score` **mỗi game một nghĩa** — Tính nhanh là chuỗi đúng dài nhất (thường 5–15),
> Vẽ hình là `150 − số giây` (thường 130–145). Gộp chung một bảng thì người chơi Vẽ luôn đè bẹp người chơi
> Tính nhanh, và bảng xếp hạng thành vô nghĩa. `store/dashboard.ts` hiện xếp đúng trong phạm vi một lượt
> nên chưa gặp vấn đề này — bảng toàn sự kiện là lần đầu hai game đứng chung một chỗ.

- [ ] Test canh đúng chuyện trên: hai game không được so điểm trực tiếp với nhau

### 5.3 — Sinh QR ngay trong `/admin`

- [ ] Render QR tại chỗ thay vì chỉ hiện URL (`routes/Admin.tsx:83` hiện mới chỉ hiện URL)

Nhỏ, nhưng bớt một bước thủ công đúng lúc cuống.

---

## 4. Wave 3 (nợ cũ) — Load test + diễn tập 🔴 CHẶN NGÀY SỰ KIỆN

README tự đánh dấu **⬜ chưa làm**. Nợ này chặn cả hai wave trên: nếu hệ thống nghẽn với 5 người thật
thì mọi tính năng mới đều vô nghĩa.

- [ ] **Khảo sát wifi hội trường trước ngày sự kiện** — mang 2 điện thoại thử LAN thật. Nếu là wifi khách
      (chặn máy trong mạng) thì LAN chết, phải chuyển sang hotspot. Biết sớm còn kịp chuẩn bị.
- [ ] **5 người vẽ đồng thời trên máy BTC thật.** Mỗi frame là một lần chạy model ONNX trên CPU — đây là
      chỗ duy nhất trong hệ thống có thể nghẽn. Đo p95 thời gian một frame.
- [ ] Thử restart server giữa lúc đang chơi → xác nhận `loadSnapshot` khôi phục đúng
- [ ] Thử tắt hẳn Wi-Fi rồi chạy `MODEL_OFFLINE=1 npm start` → phải chạy bình thường
- [ ] Diễn tập đủ 5 người, **cả 2 game**, trên điện thoại thật qua LAN

Làm mục đầu tiên **trước** khi bắt đầu Wave 4 — nếu phải sửa kiến trúc vì nghẽn thì sửa lúc code còn ít.

---

## 5. Bảng theo dõi

| Wave | Việc | Ưu tiên | Trạng thái |
|---|---|---|---|
| — | Setup + verify trên máy thật | — | ✅ xong (2026-09-17) |
| — | INSTALL.md | — | ✅ xong (2026-09-17) |
| — | Chốt hạ tầng: LAN, không deploy | — | ✅ chốt (2026-09-17) |
| — | Chốt dùng Google Form, không tự xây kho | — | ✅ chốt (2026-09-17) |
| 3 | Khảo sát wifi hội trường | 🔴 | ⬜ |
| 3 | Load test 5 người vẽ đồng thời | 🔴 | ⬜ |
| 3 | Diễn tập đầu-cuối, 2 game, điện thoại thật | 🔴 | ⬜ |
| 4.1 | `SIGNUP_FORM_URL` trong .env + `GET /api/config` | 🔴 | ✅ xong (2026-09-17) |
| 4.2 | Nút "Đăng ký vào CLB" ở màn kết quả, điền sẵn tên | 🔴 | ✅ xong (2026-09-17) |
| 4.3 | Dán link Form thật vào `.env` | 🔴 | ⬜ **chờ bạn** |
| 4.3 | In QR của Form ra giấy (dự phòng) | 🟡 | ⬜ |
| 4.3 | Thử mở Form từ điện thoại khi đang nối LAN | 🔴 | ⬜ |
| 5.1 | Màn hình chiếu `/display` | 🟡 | ⬜ |
| 5.2 | Bảng xếp hạng toàn sự kiện | 🟡 | ⬜ |
| 5.3 | Sinh QR trong `/admin` | 🟢 | ⬜ |

---

## 6. Quy ước vẫn giữ nguyên

Code mới phải theo đúng quy ước đã có (README mục "Quy ước khi thêm code"):

1. Endpoint mới → `routes/` theo domain, validate bằng zod, gọi `services/`. **Không viết luật trong route.**
2. **Không** thêm database, ORM, migration. JSONL append là đủ.
3. Test đặt cạnh code (`*.test.ts`). Test chống gian lận là bắt buộc.
4. Hằng số có số đo phải kèm comment nói rõ đã đo ra sao.
5. Đụng model AI → chạy lại `npm run eval:model` và đo accuracy trước khi merge.

**Thêm một quy ước cho wave này:** mọi thứ ghi vào `data/` là dữ liệu cá nhân thật của sinh viên.
Không log ra console, không trả về trong endpoint nào thiếu `requireAdmin`.
