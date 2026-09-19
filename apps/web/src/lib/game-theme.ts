import { Brain, Brush, Calculator, Grid3x3, type LucideIcon } from 'lucide-react';
import type { GameKind } from './types';

/**
 * Icon + màu nhận diện của từng game. Chỉ để trang trí — tên game vẫn lấy từ
 * `GAME_LABEL` trong types.ts.
 *
 * `chip` là nhãn ĐẶC — khối màu nguyên, chữ đen. Không dùng nền nhạt 10% như
 * trước: nền mờ là thứ đầu tiên phải bỏ khi chuyển sang neo-brutalism.
 *
 * `active` là bộ viền cho thẻ của TRÒ ĐANG MỞ: viền và KHỐI BÓNG cùng màu game,
 * thay cho viền trắng + bóng trắng mặc định. Dùng chính màu của game (không phải
 * một màu "đang chọn" chung) để ở cả trang chủ lẫn /admin, cái đang nổi lên luôn
 * là thứ người ta đã nhận ra bằng màu.
 *
 * Class viết đầy đủ (không ghép chuỗi) để Tailwind quét ra được.
 */
export const GAME_THEME: Record<
  GameKind,
  { icon: LucideIcon; chip: string; tile: string; active: string; blurb: string }
> = {
  math: {
    icon: Calculator,
    chip: 'border-ink bg-math text-ink',
    tile: 'bg-math text-ink',
    active: 'border-math shadow-[6px_6px_0_var(--color-math)]',
    blurb: 'chọn nhanh đáp án đúng',
  },
  draw: {
    icon: Brush,
    chip: 'border-ink bg-draw text-ink',
    tile: 'bg-draw text-ink',
    active: 'border-draw shadow-[6px_6px_0_var(--color-draw)]',
    blurb: 'vẽ để AI đoán ra hình',
  },
  memory: {
    icon: Brain,
    chip: 'border-ink bg-memory text-ink',
    tile: 'bg-memory text-ink',
    active: 'border-memory shadow-[6px_6px_0_var(--color-memory)]',
    blurb: 'nhớ rồi lặp lại chuỗi ô',
  },
  spot: {
    icon: Grid3x3,
    chip: 'border-ink bg-spot text-ink',
    tile: 'bg-spot text-ink',
    active: 'border-spot shadow-[6px_6px_0_var(--color-spot)]',
    blurb: 'tìm ô lệch màu trong lưới',
  },
};
