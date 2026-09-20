// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { GameGuideButton, GameGuideCard } from './GameGuide';
import { GAME_GUIDE } from '../lib/game-guide';
import { GAME_KINDS } from '../lib/types';

/**
 * Người chơi ở booth có 60 giây và không ai hỏi được ai. Luật phải ở ngay đó,
 * và phải đúng trò họ sắp chơi — hiện nhầm luật còn tệ hơn không hiện gì.
 */
afterEach(() => cleanup());

describe('GameGuideCard (phòng chờ)', () => {
  it('bày sẵn luật, không phải bấm gì', () => {
    render(<GameGuideCard game="memory" />);
    for (const step of GAME_GUIDE.memory.steps) {
      expect(screen.getByText(step)).toBeTruthy();
    }
    expect(screen.getByText(GAME_GUIDE.memory.scoring)).toBeTruthy();
  });

  it('hiện luật của ĐÚNG trò, không phải trò khác', () => {
    render(<GameGuideCard game="spot" />);
    expect(screen.getByText(GAME_GUIDE.spot.steps[0]!)).toBeTruthy();
    expect(screen.queryByText(GAME_GUIDE.math.steps[0]!)).toBeNull();
  });
});

describe('GameGuideButton (trong lượt)', () => {
  it('mặc định ĐÓNG — không che bàn chơi', () => {
    render(<GameGuideButton game="math" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(GAME_GUIDE.math.steps[0]!)).toBeNull();
  });

  it('bấm thì mở, và nói rõ đồng hồ vẫn chạy', () => {
    render(<GameGuideButton game="math" />);
    fireEvent.click(screen.getByRole('button', { name: /cách chơi/i }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(GAME_GUIDE.math.steps[0]!)).toBeTruthy();
    // Mở bảng luật giữa lượt rất dễ bị tưởng là tạm dừng.
    expect(screen.getByText(/đồng hồ vẫn đang chạy/i)).toBeTruthy();
  });

  it('đóng được bằng nút, và bằng phím Esc', () => {
    render(<GameGuideButton game="draw" />);
    const open = () => fireEvent.click(screen.getByRole('button', { name: /cách chơi/i }));

    open();
    fireEvent.click(screen.getByRole('button', { name: /chơi tiếp/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('nội dung luật', () => {
  it('trò nào cũng có đủ các bước và cách tính điểm', () => {
    for (const game of GAME_KINDS) {
      const guide = GAME_GUIDE[game];
      expect(guide.steps.length).toBeGreaterThanOrEqual(2);
      expect(guide.scoring.length).toBeGreaterThan(10);
      // Câu dài quá thì không ai đọc lúc đang xếp hàng.
      for (const step of guide.steps) expect(step.length).toBeLessThanOrEqual(80);
    }
  });
});
