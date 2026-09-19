import React from 'react';
import { createRoot } from 'react-dom/client';
// Font tự host — Vite đóng gói file font vào dist. Ngày sự kiện không có internet
// thì Google Fonts không tải được, nên KHÔNG dùng link CDN.
//
// MỘT họ chữ cho cả app, weight 400→900 (tiêu đề dùng 800/900). Be Vietnam Pro
// được thiết kế cho tiếng Việt nên dấu không vỡ ở cỡ lớn — điều mà một font
// hiển thị nhập khẩu bất kỳ không hứa được.
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/800.css';
import '@fontsource/be-vietnam-pro/900.css';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
