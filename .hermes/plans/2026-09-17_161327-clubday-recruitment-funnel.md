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

### 1.1 — Đăng ký KHÔNG sống trong `Round`

**✅ CHỐT: `Signup` là kho riêng, tách hẳn khỏi `Map<roundId, Round>`.**

Quy ước repo nói "thêm dữ liệu mới cho một lượt thì thêm field vào `Round`/`Player`". Đăng ký **không phải**
dữ liệu của một lượt — đây là chỗ nó khác mọi thứ đã làm trước giờ:

| | Round / Player | Signup |
|---|---|---|
| Vòng đời | Phù du, hết lượt là xong | Tích luỹ cả ngày, phải sống sót tới lúc bàn giao |
| `reset` xoá? | Có, đúng thiết kế | **Không bao giờ** |
| Mất thì sao? | Khó chịu | Hỏng cả sự kiện |

Nhét `Signup` vào `Player` là để `resetAll()` xoá mất danh sách đăng ký — lỗi không sửa được sau sự kiện.

**Cách lưu:** append-only JSONL ở `data/signups.jsonl`, ghi **ngay lúc nhận**, không đợi snapshot lúc thoát.
Vẫn đúng nguyên tắc "không database, không ORM, không migration" của repo — chỉ là `appendFileSync` một dòng.

> `data/` đã nằm trong `.gitignore` (dòng 10) → danh sách liên hệ **không** thể lỡ tay commit lên repo. Đã kiểm tra.

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

## 2. Wave 4 — Phễu đăng ký 🔴 ƯU TIÊN CAO NHẤT

Ba việc dưới là **một mạch**, nên làm chung một lần. Làm 1 mà không có 3 thì BTC không lấy được dữ liệu ra.

### 4.1 — `POST /api/signups` + kho lưu

- [ ] `store/signups.ts` — `addSignup()`, `allSignups()`, `loadSignups()` lúc boot
- [ ] `routes/signups.ts` — validate zod, gọi service (không viết luật trong route)
- [ ] Ghi `data/signups.jsonl` bằng append ngay trong request, không đợi `saveSnapshot`
- [ ] `config.ts` — thêm `SIGNUPS_FILE` (mặc định `data/signups.jsonl`), theo đúng kiểu `SNAPSHOT_FILE:34`
- [ ] Chặn trùng: cùng MSSV gửi 2 lần thì cập nhật, không thêm dòng mới trong danh sách xuất ra
- [ ] `store/signups.test.ts` — trùng MSSV, thiếu trường, ghi rồi đọc lại đúng

**Không cần `requireAdmin`** — người chơi tự gửi. Nhưng cần giới hạn tốc độ theo IP để không ai spam
được vài nghìn dòng rác vào file.

### 4.2 — Form đăng ký ngay sau bảng xếp hạng

- [ ] Thêm khối đăng ký vào `routes/Dashboard.tsx`
- [ ] **Prefill tên** đã nhập ở lobby — người chơi không phải gõ lại
- [ ] Gửi xong hiện xác nhận rõ ràng, dùng `Toast.tsx` đã có
- [ ] Nhớ trạng thái "đã đăng ký" ở localStorage để không hỏi lại người đã gửi
- [ ] Một dòng nói rõ **dùng để làm gì và ai giữ**, ngay trên nút gửi

**Vì sao đặt ở dashboard:** đây là thời điểm vàng — vừa chơi xong, đang vui, điện thoại đang cầm trên tay,
tên đã có sẵn. Đặt ở trước khi chơi thì thành rào chắn và sẽ mất người ngay ở cửa.

**⚠️ Quyết định còn mở — cần bạn chốt trước khi code:** form xin những trường nào?

| Trường | Đề xuất | Ghi chú |
|---|---|---|
| Tên | ✅ bắt buộc | Đã có sẵn từ lobby, prefill |
| MSSV | ✅ bắt buộc | Dùng làm khoá chống trùng |
| Email **hoặc** SĐT | ✅ bắt buộc, chọn 1 | Bắt cả hai là mất người |
| Khoa / ngành | ⬜ tuỳ | Bỏ được thì bỏ |
| Mảng quan tâm | ⬜ tuỳ | Hữu ích cho phân nhóm, nhưng tốn một lần chạm nữa |

**Mỗi ô thêm là một người bỏ cuộc.** Đề xuất của tôi: đúng **3 ô** (tên prefill + MSSV + 1 liên lạc).

### 4.3 — Xuất CSV ở `/admin`

- [ ] `GET /api/admin/signups.csv` — dùng lại `requireAdmin` đã có ở `routes/admin-guard.ts`
- [ ] Nút tải trong `routes/Admin.tsx`
- [ ] Hiện **số đăng ký hiện tại** ngay trên màn admin — BTC theo dõi được cả ngày mà không cần mở file

**Vì sao cần:** không có nút này thì BTC phải mò file trong `data/` trên máy, đúng lúc đang bận nhất.

**Định nghĩa "xong" của Wave 4:** chơi thử một lượt trên **điện thoại thật** → đăng ký → bấm tải CSV ở `/admin`
→ mở ra thấy đúng dòng vừa nhập.

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
| 3 | Khảo sát wifi hội trường | 🔴 | ⬜ |
| 3 | Load test 5 người vẽ đồng thời | 🔴 | ⬜ |
| 3 | Diễn tập đầu-cuối, 2 game, điện thoại thật | 🔴 | ⬜ |
| 4 | Chốt trường của form đăng ký | 🔴 | ⬜ **chờ quyết định** |
| 4.1 | `POST /api/signups` + `data/signups.jsonl` | 🔴 | ⬜ |
| 4.2 | Form đăng ký ở Dashboard | 🔴 | ⬜ |
| 4.3 | Xuất CSV ở `/admin` | 🔴 | ⬜ |
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
