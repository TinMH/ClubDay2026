import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Home } from './routes/Home';
import { Lobby } from './routes/Lobby';
import { Play } from './routes/Play';
import { Dashboard } from './routes/Dashboard';
import { Admin } from './routes/Admin';

/**
 * Router. File nền tảng — ĐÓNG BĂNG.
 *
 * Không cần thêm route khi làm game: `Play.tsx` là dispatcher, tự chọn
 * MathGame hay DrawGame dựa trên `round.game`.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Cách B: QR riêng cho từng lượt / khu vực */}
        <Route path="/r/:code" element={<Home />} />
        <Route path="/lobby/:roundId" element={<Lobby />} />
        <Route path="/play/:roundId" element={<Play />} />
        <Route path="/dashboard/:roundId" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
