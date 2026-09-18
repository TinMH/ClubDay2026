import { Brain, Brush, Calculator, type LucideIcon } from 'lucide-react';
import type { GameKind } from './types';

/**
 * Icon + màu nhận diện của từng game. Chỉ để trang trí — tên game vẫn lấy từ
 * `GAME_LABEL` trong types.ts.
 *
 * Class viết đầy đủ (không ghép chuỗi) để Tailwind quét ra được.
 */
export const GAME_THEME: Record<
  GameKind,
  { icon: LucideIcon; chip: string; tile: string; blurb: string }
> = {
  math: {
    icon: Calculator,
    chip: 'border-math/40 bg-math/10 text-math',
    tile: 'bg-math text-ink',
    blurb: 'chọn nhanh đáp án đúng',
  },
  draw: {
    icon: Brush,
    chip: 'border-draw/40 bg-draw/10 text-draw',
    tile: 'bg-draw text-ink',
    blurb: 'vẽ để AI đoán ra hình',
  },
  memory: {
    icon: Brain,
    chip: 'border-memory/40 bg-memory/10 text-memory',
    tile: 'bg-memory text-ink',
    blurb: 'nhớ rồi lặp lại chuỗi ô',
  },
};
