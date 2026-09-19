import { Lock } from 'lucide-react';
import { GAME_THEME } from '../../lib/game-theme';
import { GAME_LABEL, type GameKind } from '../../lib/types';

export interface ActiveGamePanelProps {
  /** `null` = đang tạm đóng, không ai vào lượt mới được. */
  activeGame: GameKind | null;
  disabled: boolean;
  onClose: () => void;
}

/**
 * Trạng thái quan trọng nhất của màn hình BTC: ĐANG MỞ TRÒ NÀO.
 *
 * Vẽ to, bằng icon và màu của chính trò đó, để liếc một cái là biết — và để lúc
 * đang đóng thì trông khác hẳn chứ không chỉ đổi mỗi chữ.
 */
export function ActiveGamePanel({ activeGame, disabled, onClose }: ActiveGamePanelProps) {
  const Icon = activeGame ? GAME_THEME[activeGame].icon : Lock;

  return (
    <section
      className={`card flex flex-wrap items-center gap-3 p-4 ${
        activeGame ? GAME_THEME[activeGame].active : 'border-dashed'
      }`}
    >
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
          activeGame ? GAME_THEME[activeGame].tile : 'bg-surface-2 text-muted'
        }`}
      >
        <Icon aria-hidden="true" className="h-6 w-6" />
      </span>

      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-muted">Trò đang mở</p>
        <p
          className={`font-display text-2xl font-extrabold leading-tight ${
            activeGame ? '' : 'text-muted'
          }`}
        >
          {activeGame ? GAME_LABEL[activeGame] : 'Đang đóng'}
        </p>
      </div>

      <button onClick={onClose} disabled={disabled || activeGame === null} className="btn btn-ghost btn-sm ml-auto">
        <Lock aria-hidden="true" className="h-4 w-4" />
        Tạm đóng
      </button>

      <p className="w-full text-xs text-muted">
        Người chơi không tự chọn trò — họ chỉ vào được trò đang mở. Tạo lượt cho trò nào thì trò
        đó được mở, và mọi lượt đang CHỜ của trò trước sẽ bị bỏ.
      </p>
    </section>
  );
}
