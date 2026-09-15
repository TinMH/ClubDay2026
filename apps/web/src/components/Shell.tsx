import type { ReactNode } from 'react';

/** Khung màn hình chung — giữ bố cục nhất quán trên điện thoại. */
export function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <>
      <Backdrop />
      <main
        className={`mx-auto flex min-h-dvh flex-col gap-5 px-5 py-6 sm:py-10 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
      >
        {children}
      </main>
    </>
  );
}

/**
 * Nền trang trí: hai vệt màu, lưới chấm và bốn hình khối nhỏ (tròn, tam giác, vuông,
 * dấu cộng — cùng bộ hình với 4 nút đáp án). Đứng yên: người chơi đang đua giờ,
 * nền không được giành sự chú ý.
 */
function Backdrop() {
  return (
    <div aria-hidden="true" className="stage-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Hai hình ở giữa màn hình: điện thoại hẹp thì đè lên nội dung → chỉ hiện từ sm trở lên. */}
      <svg viewBox="0 0 40 40" className="absolute left-[7%] top-[9%] hidden h-9 w-9 text-accent/30 sm:block">
        <circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="6" />
      </svg>
      <svg
        viewBox="0 0 40 40"
        className="absolute right-[7%] top-[36%] hidden h-11 w-11 rotate-12 text-draw/25 sm:block"
      >
        <path d="M20 5 L36 33 H4 Z" fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
      </svg>
      <svg viewBox="0 0 40 40" className="absolute bottom-[16%] left-[4%] h-10 w-10 -rotate-12 text-math/25">
        <rect x="7" y="7" width="26" height="26" rx="4" fill="none" stroke="currentColor" strokeWidth="6" />
      </svg>
      <svg viewBox="0 0 40 40" className="absolute bottom-[5%] right-[12%] h-8 w-8 text-secondary/30">
        <path d="M20 6 V34 M6 20 H34" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      </svg>
    </div>
  );
}
