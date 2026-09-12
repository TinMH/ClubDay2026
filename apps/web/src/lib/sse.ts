import { useEffect, useRef, useState } from 'react';
import type { RoundState } from './types';
import { syncClock } from './api';

/**
 * Theo dõi trạng thái lượt qua SSE, tự kết nối lại khi mạng chập chờn.
 * Wi-Fi sự kiện hay rớt nên phần reconnect là bắt buộc, không phải tính năng phụ.
 */
export function useRoundStream(
  roundId: string | undefined,
  onState: (s: RoundState) => void,
): boolean {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onState);
  cb.current = onState;

  useEffect(() => {
    if (!roundId) return;

    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connect = (): void => {
      if (disposed) return;
      es = new EventSource(`/api/rounds/${roundId}/stream`);

      es.addEventListener('open', () => setConnected(true));

      es.addEventListener('state', (ev) => {
        try {
          const state = JSON.parse((ev as MessageEvent).data) as RoundState;
          syncClock(state.serverNow);
          cb.current(state);
        } catch {
          /* payload hỏng thì bỏ qua, không làm sập UI */
        }
      });

      es.addEventListener('error', () => {
        setConnected(false);
        es?.close();
        if (!disposed) retry = setTimeout(connect, 1_500);
      });
    };

    connect();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [roundId]);

  return connected;
}
