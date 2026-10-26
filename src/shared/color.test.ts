import { describe, expect, it } from 'vitest';
import { isSafeImageUrl, toRgbChannels, withAlpha } from './color';

describe('toRgbChannels', () => {
  it('expands shorthand hex', () => {
    expect(toRgbChannels('#f80')).toBe('255 136 0');
  });

  it('converts six-digit hex, with or without #', () => {
    expect(toRgbChannels('#f97316')).toBe('249 115 22');
    expect(toRgbChannels('0ea5e9')).toBe('14 165 233');
    expect(toRgbChannels('  #FFFFFF  ')).toBe('255 255 255');
  });

  it('falls back for empty or invalid values', () => {
    expect(toRgbChannels('')).toBe('249 115 22');
    expect(toRgbChannels('#12')).toBe('249 115 22');
    expect(toRgbChannels('not-a-color')).toBe('249 115 22');
    expect(toRgbChannels('#gggggg')).toBe('249 115 22');
    expect(toRgbChannels('', '1 2 3')).toBe('1 2 3');
  });
});

describe('withAlpha', () => {
  it('builds an rgba colour from hex', () => {
    expect(withAlpha('#f97316', 0.5)).toBe('rgba(249,115,22,0.5)');
    expect(withAlpha('#fff', 1)).toBe('rgba(255,255,255,1)');
  });

  it('uses the fallback colour for invalid input', () => {
    expect(withAlpha('nope', 0.2)).toBe('rgba(249,115,22,0.2)');
    expect(withAlpha('nope', 0.2, '1,2,3')).toBe('rgba(1,2,3,0.2)');
  });
});

describe('isSafeImageUrl', () => {
  it('accepts HTTPS URLs', () => {
    expect(isSafeImageUrl('https://example.com/image.png')).toBe(true);
    expect(isSafeImageUrl('https://cdn.example.com/a/b.webp?v=2')).toBe(true);
  });

  it('accepts site-relative paths', () => {
    expect(isSafeImageUrl('/api/media/default/a.png')).toBe(true);
    expect(isSafeImageUrl('/logo.svg')).toBe(true);
  });

  it('rejects protocol-relative URLs', () => {
    expect(isSafeImageUrl('//evil.example/image.png')).toBe(false);
  });

  it('rejects insecure or malformed URLs', () => {
    expect(isSafeImageUrl('http://example.com/a.png')).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeImageUrl('data:image/png;base64,abc')).toBe(false);
    expect(isSafeImageUrl('not a url')).toBe(false);
    expect(isSafeImageUrl('')).toBe(false);
  });
});
