// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_MS, useToast } from './Toast';

describe('useToast — thông báo tự tắt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hiện ngay khi gọi, tự tắt đúng sau TOAST_MS', () => {
    const { result } = renderHook(() => useToast<string>());

    act(() => result.current[1]('đúng'));
    expect(result.current[0]?.value).toBe('đúng');

    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(result.current[0]).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current[0]).toBeNull();
  });

  it('thông báo mới thay cái cũ và đếm lại từ đầu — kể cả khi nội dung giống hệt', () => {
    const { result } = renderHook(() => useToast<string>());

    act(() => result.current[1]('đúng'));
    const first = result.current[0]?.id;

    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 200);
    });
    act(() => result.current[1]('đúng'));
    expect(result.current[0]?.id).not.toBe(first);

    // Hẹn giờ của cái CŨ lẽ ra đã bắn ở đây — nó phải bị huỷ.
    act(() => {
      vi.advanceTimersByTime(TOAST_MS - 1);
    });
    expect(result.current[0]).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current[0]).toBeNull();
  });
});
