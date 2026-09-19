// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameTile } from './GameTile';

/**
 * Canh ĐÚNG chỗ đã gây hiểu nhầm: nhãn nút phải nói ra việc nó làm.
 *
 * Bản trước ô nào cũng ghi "Tạo lượt", kể cả ô của trò CHƯA mở — nên nhìn vào
 * màn hình BTC không thấy đường nào để đổi trò, trong khi bấm đúng nút đó là
 * đổi. Hai lần liền người dùng tưởng app hỏng vì chuyện này.
 */
afterEach(() => cleanup());

const base = {
  maxPlayers: 5,
  disabled: false,
  onCreate: vi.fn(),
  onChangeMaxPlayers: vi.fn(),
};

describe('GameTile', () => {
  it('trò ĐANG MỞ → nút chỉ tạo lượt', () => {
    render(<GameTile game="math" active {...base} />);
    expect(screen.getByRole('button', { name: /tạo lượt/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /đổi sang trò này/i })).toBeNull();
  });

  it('trò CHƯA mở → nút nói rõ là sẽ đổi trò', () => {
    render(<GameTile game="draw" active={false} {...base} />);
    expect(screen.getByRole('button', { name: /đổi sang trò này/i })).toBeTruthy();
  });

  it('nhãn ĐANG MỞ chỉ hiện ở trò đang mở', () => {
    const { rerender } = render(<GameTile game="spot" active {...base} />);
    expect(screen.getByText(/đang mở/i)).toBeTruthy();
    rerender(<GameTile game="spot" active={false} {...base} />);
    expect(screen.queryByText(/đang mở/i)).toBeNull();
  });

  it('chỉnh sức chứa: chạm trần thì khoá, không gửi giá trị ngoài khoảng', () => {
    const onChange = vi.fn();
    render(<GameTile game="memory" active maxPlayers={1} disabled={false} onCreate={vi.fn()} onChangeMaxPlayers={onChange} />);

    const minus = screen.getByRole('button', { name: /giảm số người/i }) as HTMLButtonElement;
    expect(minus.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /tăng số người/i }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
