import { describe, expect, it } from 'vitest';
import { resolveMarkdownImageWidth } from './imageLayout';

describe('resolveMarkdownImageWidth', () => {
    it('uses viewport width minus horizontal padding on normal screens', () => {
        expect(resolveMarkdownImageWidth(390)).toBe(358);
    });

    it('caps width to max image width on large screens', () => {
        expect(resolveMarkdownImageWidth(1200)).toBe(520);
    });

    it('returns a non-zero fallback width when viewport width is unavailable', () => {
        expect(resolveMarkdownImageWidth(0)).toBe(320);
        expect(resolveMarkdownImageWidth(Number.NaN)).toBe(320);
    });
});
