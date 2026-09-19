import { Brain, Brush, Calculator, Grid3x3, type LucideIcon } from 'lucide-react';
import type { GameKind } from './types';

/**
 * Icon + màu nhận diện của từng game. Chỉ để trang trí — tên game vẫn lấy từ
 * `GAME_LABEL` trong types.ts.
 *
 * `active` là bộ viền cho thẻ của TRÒ ĐANG MỞ: viền đặc + quầng cùng màu game.
 * Dùng chính màu của game (không phải một màu "đang chọn" chung) để ở cả trang
 * chủ lẫn /admin, cái đang sáng lên luôn là thứ người ta đã nhận ra bằng màu.
 *
 * Class viết đầy đủ (không ghép chuỗi) để Tailwind quét ra được.
 */
export const GAME_THEME: Record<
  GameKind,
  { icon: LucideIcon; chip: string; tile: string; active: string; blurb: string }
> = {
  math: {
    icon: Calculator,
    chip: 'border-math/40 bg-math/10 text-math',
    tile: 'bg-math text-ink',
    active: 'border-math bg-math/10 ring-4 ring-math/25',
    blurb: 'chọn nhanh đáp án đúng',
  },
  draw: {
    icon: Brush,
    chip: 'border-draw/40 bg-draw/10 text-draw',
    tile: 'bg-draw text-ink',
    active: 'border-draw bg-draw/10 ring-4 ring-draw/25',
    blurb: 'vẽ để AI đoán ra hình',
  },
  memory: {
    icon: Brain,
    chip: 'border-memory/40 bg-memory/10 text-memory',
    tile: 'bg-memory text-ink',
    active: 'border-memory bg-memory/10 ring-4 ring-memory/25',
    blurb: 'nhớ rồi lặp lại chuỗi ô',
  },
  spot: {
    icon: Grid3x3,
    chip: 'border-spot/40 bg-spot/10 text-spot',
    tile: 'bg-spot text-ink',
    active: 'border-spot bg-spot/10 ring-4 ring-spot/25',
    blurb: 'tìm ô lệch màu trong lưới',
  },
};
