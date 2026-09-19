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
 * Nền: lưới kẻ cứng (xem `.stage-bg`) + bốn khối hình ĐẶC dán lệch góc.
 *
 * Bản cũ là mấy hình viền mảnh, mờ 25%, trôi trên hai vệt gradient — thứ nền
 * "nhẹ nhàng" mà giao diện nào cũng có. Brutalism làm ngược: hình khối đặc, màu
 * nguyên, đặt nghiêng như dán sticker, và có viền đen để không tan vào nền.
 *
 * Vẫn ĐỨNG YÊN: người chơi đang đua giờ, nền không được giành sự chú ý.
 */
function Backdrop() {
  return (
    <div aria-hidden="true" className="stage-bg pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Hai khối ở giữa màn hình: điện thoại hẹp thì đè lên nội dung → chỉ hiện từ sm trở lên. */}
      <span className="absolute left-[6%] top-[8%] hidden h-10 w-10 -rotate-6 border-[3px] border-ink bg-accent sm:block" />
      <span className="absolute right-[6%] top-[34%] hidden h-12 w-12 rotate-12 border-[3px] border-ink bg-draw sm:block" />
      <span className="absolute bottom-[15%] left-[3%] h-11 w-11 rotate-3 border-[3px] border-ink bg-math" />
      <span className="absolute bottom-[6%] right-[10%] h-9 w-9 -rotate-12 border-[3px] border-ink bg-memory" />
    </div>
  );
}
