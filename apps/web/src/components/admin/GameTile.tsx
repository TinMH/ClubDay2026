import { Clock, Minus, Plus, Repeat, Users } from 'lucide-react';
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
 * Một trò ở màn hình BTC: tên trò, hai thông số, và nút tạo lượt.
 *
 * CẮT CHỮ TỚI MỨC CÒN ĐỌC ĐƯỢC. Bản trước viết "Lượt Tính nhanh", "90 giây",
 * "Số người mỗi lượt" — chữ "Lượt" lặp ở cả bốn ô trong một khu vực vốn đã tên
 * là "tạo lượt", còn "Số người mỗi lượt" thì nói lại đúng thứ icon người đã nói.
 * Giờ icon gánh phần nhãn, chữ chỉ còn giữ con số.
 *
 * Icon không tự nói được với trình đọc màn hình, nên mỗi con số vẫn kèm một nhãn
 * `sr-only` đầy đủ. Cắt chữ là cắt phần MẮT đã hiểu, không phải cắt thông tin.
 */
export function GameTile({
  game,
  active,
  maxPlayers,
  disabled,
  onCreate,
  onChangeMaxPlayers,
}: GameTileProps) {
  const { icon: Icon, tile, chip, active: activeBlock } = GAME_THEME[game];
  const seconds = DURATION_MS[game] / 1000;

  return (
    <div className={`card flex flex-col gap-4 p-5 ${active ? activeBlock : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={`grid h-12 w-12 shrink-0 place-items-center ${tile}`}>
          <Icon aria-hidden="true" className="h-6 w-6" />
        </span>
        {active && (
          <span
            className={`border-2 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wide ${chip}`}
          >
            Đang mở
          </span>
        )}
      </div>

      <h3 className="font-display text-lg font-black uppercase leading-tight">
        {GAME_LABEL[game]}
      </h3>

      {/* Hai thông số trên một hàng: thời lượng (đọc thôi) và sức chứa (chỉnh được). */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t-2 border-line pt-4">
        <span className="flex items-center gap-1.5 font-display font-black tabular-nums">
          <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
          {seconds}s
          <span className="sr-only">mỗi lượt</span>
        </span>

        <span className="flex shrink-0 items-center gap-1">
          <Users aria-hidden="true" className="mr-1 h-4 w-4 shrink-0 text-muted" />
          <button
            onClick={() => onChangeMaxPlayers(maxPlayers - 1)}
            disabled={disabled || maxPlayers <= 1}
            aria-label={`Giảm số người mỗi lượt ${GAME_LABEL[game]}`}
            className="btn btn-ghost btn-sm px-2"
          >
            <Minus aria-hidden="true" className="h-4 w-4" />
          </button>
          <span role="status" className="w-8 text-center font-display text-xl font-black tabular-nums">
            {maxPlayers}
            <span className="sr-only"> người mỗi lượt</span>
          </span>
          <button
            onClick={() => onChangeMaxPlayers(maxPlayers + 1)}
            disabled={disabled || maxPlayers >= MAX_PLAYERS_CAP}
            aria-label={`Tăng số người mỗi lượt ${GAME_LABEL[game]}`}
            className="btn btn-ghost btn-sm px-2"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
        </span>
      </div>

      {/*
        NHÃN NÓI ĐÚNG VIỆC NÚT LÀM.
        Bấm nút này ở một trò chưa mở thì nó ĐỔI TRÒ ĐANG MỞ sang trò đó rồi mới
        tạo lượt. Bản trước nút nào cũng ghi "Tạo lượt", nên nhìn vào màn hình
        không có đường nào để đổi trò — trong khi đổi được, chỉ là không ai nói.

        Nút RIÊNG, không phải cả thẻ bấm được: thẻ có sẵn hai nút +/- bên trong,
        một vùng bấm lớn bao quanh chúng là cái bẫy bấm nhầm.
      */}
      <button
        onClick={onCreate}
        disabled={disabled}
        className={`btn btn-sm w-full ${active ? '' : 'btn-accent'}`}
      >
        {active ? (
          <>
            <Plus aria-hidden="true" className="h-5 w-5" />
            Tạo lượt
          </>
        ) : (
          <>
            <Repeat aria-hidden="true" className="h-5 w-5" />
            Đổi sang trò này
          </>
        )}
      </button>
    </div>
  );
}
