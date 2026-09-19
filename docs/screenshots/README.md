# Ảnh chụp màn hình trong README

**Đừng chụp tay và đừng sửa tay.** Cả năm file `.png` ở đây do script sinh ra:

```bash
npm run build          # script chụp bản đã build
npm run screenshots
```

`scripts/screenshots.mjs` tự dựng một sự kiện nhỏ rồi chụp lại: bật server riêng
ở cổng 8799 với snapshot trong thư mục tạm, tạo lượt Tính nhanh, cho hai người
chơi giả vào, mở trình duyệt thật (Playwright/Chromium) ở khổ điện thoại
390×844, chơi vài câu ĐÚNG để bảng hạng có điểm thật, rồi chụp:

| File | Màn hình |
|---|---|
| `home.png` | Trang chủ `/` |
| `lobby.png` | Phòng chờ `/lobby/<mã>` |
| `play.png` | Đang chơi `/play/<mã>` |
| `dashboard.png` | Bảng hạng `/dashboard/<mã>` |
| `admin.png` | Quản trị `/admin`, khổ máy tính 1280 |

## Vì sao viết script thay vì chụp tay

Giao diện còn đổi nhiều. Ảnh chụp tay thì lần sau phải mở máy chụp lại từ đầu,
và không ai nhớ lần trước chụp ở khổ nào, tên người chơi là gì, bảng hạng có bao
nhiêu người. Chạy lại script là ra đúng bộ ảnh cũ với đúng bố cục cũ.

Nó cũng tránh được hai lỗi dễ mắc khi chụp tay: lộ mã quản trị thật, và dùng tên
thật của người chơi mà chưa xin phép. Người chơi trong ảnh đều là tên giả do
script nhập.

## Máy chưa cài trình duyệt cho Playwright

```bash
npx playwright install chromium
```
