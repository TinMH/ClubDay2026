import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { saveSession } from '../lib/session';
import { Shell } from '../components/Shell';

const MESSAGES: Record<string, string> = {
  ROUND_FULL: 'Lượt này đủ 5 người rồi — chờ lượt sau nhé.',
  ROUND_STARTED: 'Lượt này đã bắt đầu rồi — chờ lượt sau nhé.',
  NOT_FOUND: 'Không tìm thấy lượt này. Kiểm tra lại mã.',
  BAD_REQUEST: 'Tên không hợp lệ (1–20 ký tự).',
};

/**
 * Nhập tên và vào lượt.
 *   - `/`          → Cách A: tự vào lượt đang mở
 *   - `/r/<mã>`    → Cách B: vào đúng lượt của khu vực đó
 */
export function Home() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const roundId = code?.toUpperCase();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.join(name.trim(), roundId);
      saveSession({ playerId: res.playerId, roundId: res.roundId, game: res.game, name: name.trim() });
      navigate(`/lobby/${res.roundId}`);
    } catch (err) {
      const key = err instanceof ApiError ? err.code : 'UNKNOWN';
      setError(MESSAGES[key] ?? 'Có lỗi xảy ra, thử lại nhé.');
      setBusy(false);
    }
  }

  return (
    <Shell>
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">ClubDay</h1>
        <p className="mt-2 text-muted">Nhập tên để vào lượt chơi</p>
      </header>

      <form onSubmit={submit} className="space-y-4">
        {roundId && (
          <p className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-center text-sm">
            Bạn đang vào lượt <span className="font-mono font-bold">{roundId}</span>
          </p>
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
          placeholder="Tên của bạn"
          className="w-full rounded-xl border border-white/15 bg-ink-soft px-4 py-4 text-lg outline-none placeholder:text-muted focus:border-brand"
        />

        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="w-full rounded-xl bg-brand py-4 text-lg font-semibold transition hover:brightness-110 disabled:opacity-40"
        >
          {busy ? 'Đang vào…' : 'Vào chơi'}
        </button>

        {error && <p className="text-center text-sm text-wrong">{error}</p>}
      </form>

      <footer className="mt-auto text-center text-sm text-muted">
        <Link to="/admin" className="underline-offset-4 hover:underline">
          Trang quản trị
        </Link>
      </footer>
    </Shell>
  );
}
