import type { ReactNode } from 'react';

/** Khung màn hình chung — giữ bố cục nhất quán trên điện thoại. */
export function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main
      className={`mx-auto flex min-h-screen flex-col gap-6 px-5 py-8 ${wide ? 'max-w-3xl' : 'max-w-xl'}`}
    >
      {children}
    </main>
  );
}
