import { describe, expect, it } from 'vitest';
import { buildSignupUrl } from './signup';

const FORM = 'https://docs.google.com/forms/d/e/ABC123/viewform';

describe('buildSignupUrl', () => {
  it('link rỗng → không hiện nút', () => {
    expect(buildSignupUrl('', 'entry.1', 'Minh')).toBe('');
    expect(buildSignupUrl('   ', 'entry.1', 'Minh')).toBe('');
  });

  it('link sai định dạng → không hiện nút, KHÔNG ném lỗi', () => {
    expect(buildSignupUrl('khong-phai-link', 'entry.1', 'Minh')).toBe('');
  });

  it('chặn scheme không phải http(s) lọt từ .env vào href', () => {
    expect(buildSignupUrl('javascript:alert(1)', '', '')).toBe('');
  });

  it('không có mã ô → trả nguyên link, không thêm gì', () => {
    expect(buildSignupUrl(FORM, '', 'Minh')).toBe(FORM);
  });

  it('có mã ô → điền sẵn tên kèm usp=pp_url', () => {
    const url = new URL(buildSignupUrl(FORM, 'entry.123456789', 'Minh'));
    expect(url.searchParams.get('entry.123456789')).toBe('Minh');
    expect(url.searchParams.get('usp')).toBe('pp_url');
  });

  it('tên rỗng → không điền sẵn, tránh gửi ô trống lên Form', () => {
    expect(buildSignupUrl(FORM, 'entry.1', '   ')).toBe(FORM);
  });

  it('tên có dấu và khoảng trắng được mã hoá đúng', () => {
    const raw = buildSignupUrl(FORM, 'entry.1', 'Nguyễn Văn A');
    expect(raw).not.toContain(' ');
    expect(new URL(raw).searchParams.get('entry.1')).toBe('Nguyễn Văn A');
  });

  it('link đã có sẵn query → giữ nguyên query cũ', () => {
    const url = new URL(buildSignupUrl(`${FORM}?foo=bar`, 'entry.1', 'Minh'));
    expect(url.searchParams.get('foo')).toBe('bar');
    expect(url.searchParams.get('entry.1')).toBe('Minh');
  });
});
