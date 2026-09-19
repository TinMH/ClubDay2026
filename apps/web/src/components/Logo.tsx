import logoUrl from '../assets/logo-dsc.png';

/**
 * Logo DSC — HCMUTE Developer Student Club. Dùng nguyên file gốc, KHÔNG tô lại màu.
 *
 * Chữ trong logo màu navy: đặt thẳng lên nền tối của app là chìm mất, nên logo
 * luôn nằm trên một tấm nền trắng.
 *
 * Bóng đổ ở đây là màu VÀNG, không phải trắng như mọi khối khác: khối này vốn đã
 * trắng, bóng trắng sau lưng nó thì không ai thấy.
 */
export function DscLogo({ size = 'md', className = '' }: { size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      className={`inline-flex items-center bg-white shadow-[6px_6px_0_var(--color-accent)] ${
        size === 'md' ? 'rounded-2xl px-4 py-3' : 'rounded-xl px-2.5 py-1.5'
      } ${className}`}
    >
      <img
        src={logoUrl}
        alt="HCMUTE Developer Student Club"
        width={876}
        height={332}
        className={size === 'md' ? 'h-16 w-auto sm:h-20' : 'h-8 w-auto'}
      />
    </span>
  );
}
