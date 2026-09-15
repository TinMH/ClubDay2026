import React from 'react';
import { createRoot } from 'react-dom/client';
// Font tự host — Vite đóng gói file font vào dist. Ngày sự kiện không có internet
// thì Google Fonts không tải được, nên KHÔNG dùng link CDN.
import '@fontsource-variable/baloo-2/index.css';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
