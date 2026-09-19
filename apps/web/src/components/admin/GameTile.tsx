import { Minus, Plus, Users } from 'lucide-react';
import { GAME_THEME } from '../../lib/game-theme';
import { DURATION_MS, GAME_LABEL, MAX_PLAYERS_CAP, type GameKind } from '../../lib/types';

export interface GameTileProps {
  game: GameKind;
  /** Trò này có phải trò đang mở không — viền và nhãn đổi theo. */
  active: boolean;
  /** Sức chứa hiện hành của trò này. */
  maxPlayers: number;
  disabled: boolean;
  onCreate: () => void;
  onChangeMaxPlayers: (value: number) => void;
}

/**
 * Một trò ở màn hình BTC: nút tạo lượt, và ô chỉnh sức chứa ngay bên dưới.
 *
 * Hai việc đặt cạnh nhau vì chúng đi liền nhau trong thực tế: BTC nhìn hàng
 * người đang đứng rồi quyết định lượt tới mấy người, xong bấm tạo luôn.
 */
export function GameTile({
  game,
  active,
  maxPlayers,
  disabled,
  onCreate,
  onChangeMaxPlayers,
}: GameTileProps) {
  const { icon: Icon, tile, chip, active: activeRing } = GAME_THEME[game];

  return (
    <div className={`card flex flex-col gap-3 p-4 ${active ? activeRing : ''}`}>
      <button
        onClick={onCreate}
        disabled={disabled}
        className="flex min-w-0 items-center gap-3 text-left"
      >
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tile}`}>
          <Icon aria-hidden="true" className="h-6 w-6" />
        </span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-1 font-display text-lg font-bold">
            <Plus aria-hidden="true" className="h-5 w-5" />
            Lượt {GAME_LABEL[game]}
            {active && (
              <span
                className={`rounded-full border-2 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${chip}`}
              >
                Đang mở
              </span>
            )}
          </span>
          <span className="block text-xs text-muted">{DURATION_MS[game] / 1000} giây</span>
        </span>
      </button>

      {/*
        Chỉnh sức chứa NGAY Ở ĐÂY, cạnh nút tạo lượt: giữa sự kiện mà phải mở
        terminal sửa .env rồi khởi động lại server là không xong kịp.
        Áp cho lượt tạo từ đây về sau — lượt đang chờ giữ nguyên luật của nó.
      */}
      <div className="flex items-center justify-between gap-2 border-t-2 border-line pt-3">
        <span id={`cap-${game}`} className="flex items-center gap-1.5 text-xs text-muted">
          <Users aria-hidden="true" className="h-4 w-4 shrink-0" />
          Số người mỗi lượt
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onChangeMaxPlayers(maxPlayers - 1)}
            disabled={disabled || maxPlayers <= 1}
            aria-label={`Giảm số người ${GAME_LABEL[game]}`}
            className="btn btn-ghost btn-sm px-2"
          >
            <Minus aria-hidden="true" className="h-4 w-4" />
          </button>
          <span
            aria-labelledby={`cap-${game}`}
            role="status"
            className="w-8 text-center font-display text-xl font-extrabold tabular-nums"
          >
            {maxPlayers}
          </span>
          <button
            onClick={() => onChangeMaxPlayers(maxPlayers + 1)}
            disabled={disabled || maxPlayers >= MAX_PLAYERS_CAP}
            aria-label={`Tăng số người ${GAME_LABEL[game]}`}
            className="btn btn-ghost btn-sm px-2"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
        </span>
      </div>
    </div>
  );
}
